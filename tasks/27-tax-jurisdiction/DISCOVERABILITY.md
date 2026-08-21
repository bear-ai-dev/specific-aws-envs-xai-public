# Discoverability

Every rule the verifier grades, and the exact place a solver can learn it without
guessing. Three routes are used: **stated** in `instruction.md`, **derivable**
from code that survives the removal, **observable** in the sandbox estate and the
month of billing recorded under `/opt/billing-sandbox`.

Paths under `src/` are relative to `/app` in the container and to
`environment/workspace/` in this repository. Line numbers are the workspace's,
i.e. after the removal, so they are what a solver actually sees.

---

## 1. The rate a business gets depends on the regime it is configured with

**Graded:** `salesTaxRate` on the issued invoice.

- **Stated** — "some maintain a rate themselves, some want each invoice priced
  against the buyer's destination by our tax authority provider, and some collect
  nothing at all".
- **Derivable** — the regime enum survives whole, with its three members and the
  empty-string spelling of the third:

  `src/setting/dto/TaxCalculationType.ts:1-5`
  ```
  export enum TaxCalculationType {
      meteringcoCalculated = 'meteringcoCalculated',
      manual = 'manual',
      none = '',
  }
  ```

  The field survives on the settings entity (`src/setting/entities/settings.entity.ts:74`),
  on the Influx row (`src/influx/entities/settingsInfluxTable.entity.ts:43`), and
  in the update DTO with the validator that lists the legal values back to the
  caller (`src/setting/dto/update-settings.dto.ts:455-464`). `taxRate` is the
  stored rate a `manual` business maintains
  (`src/setting/entities/settings.entity.ts:42`, `update-settings.dto.ts:288`).

- **Observable** — three of the five sandbox businesses show all three regimes
  side by side in `/opt/billing-sandbox/estate.json`, and the invoices they
  actually issued are in `recorded-invoices.json`:

  | business | regime | stored `taxRate` | recorded `salesTaxRate` |
  | --- | --- | --- | --- |
  | `biz_harbourgate` | `manual` | `0.19` | `0.19` |
  | `biz_northwind` | `meteringcoCalculated` | `0` | `0.06` (quoted) |
  | `biz_pinecrest` | `''` | `0.07` | `0.0` |

  `biz_pinecrest` is the worked example for the trap: it *has* a stored rate of
  `0.07`, and because it has no regime it still charges nothing.

---

## 2. A held exemption beats the regime, including a manual one

**Graded:** `salesTaxRate` is `0` for an exempt customer whatever its business is
configured with. Held out by `ostara-pelham-exempt-manual`, an exempt customer of
a business on a manual `0.21`.

- **Stated** — "a customer we hold an exemption for is charged nothing whichever
  way its business is configured".
- **Derivable** — the exemption enum and the field survive:
  `src/customer/dto/TaxExempt.ts:1-11` (`exempt = 'exempt'`, `none = 'none'`),
  `src/customer/entities/customer.entity.ts:97-98`,
  `src/influx/entities/customerInfluxRow.ts:13`,
  `src/customer/dto/create-customer.dto.ts:236-246`, and both generated OpenAPI
  specs (`docs/open-api-public-spec.json`, four occurrences).
- **Observable** — `cus_fairholme` is an exempt customer of `biz_harbourgate`,
  which is on `manual` at `0.19`. Its July invoice in `recorded-invoices.json`
  carries `salesTaxRate: 0.0`, and no rate lookup or filed transaction for it
  appears in `tax-authority-log.json`. `cus_larkspur` is the same shape against a
  `meteringcoCalculated` business.

---

## 3. Quotes go to the sandbox or the production authority per account

**Graded:** the `environment` and `api_key` the authority records for each rate
lookup and each filed transaction.

- **Stated** — "on the sandbox or the production authority according to the
  account the business is on".
- **Derivable** — `accountState` survives on the invoice
  (`src/invoice/entities/invoice.entity.ts:305`, assigned from settings at
  `:1031`) and on the settings Influx row (`settingsInfluxTable.entity.ts:59`).
  The identical selection is still performed for the payment processor a few
  files away, so the pattern and both env var names are present in surviving
  code:

  `src/customer/entities/customer.entity.ts:360`
  ```
  accountState === AccountState.production ? process.env.PROD_STRIPE_TOKEN : process.env.STRIPE_TOKEN,
  ```

  `TAX_JAR_URL` and `PROD_TAX_JAR_URL` are both set in the container environment
  and named in `task.toml`; `taxJarApiKey` survives on the settings entity
  (`settings.entity.ts:68`) and DTO (`update-settings.dto.ts:441`).
- **Observable** — the recorded month contains exactly two accounts that reach
  the authority, and they pin the routing between them: `biz_lumen` is
  `accountState: production` with key `tjk_prd_lumen_7c30`, and its lookup in
  `tax-authority-log.json` carries `"environment": "production"`; every
  `biz_northwind` lookup carries `"environment": "sandbox"` against
  `tjk_sbx_northwind_a41f`. Both rows are load-bearing. The two environments hold
  different rate tables for the same jurisdiction, which the recording does not
  show — getting the routing wrong is visible in the number, not just the field.

---

## 4. A business with no authority credential cannot issue at all

**Graded:** for a `meteringcoCalculated` business with an empty `taxJarApiKey`,
issuing the invoice must be refused with a 400.

- **Derivable** — the message is in the sandbox verbatim, and `BadRequestException`
  is the tree's idiom for it.
- **Observable** — `biz_marchetti` is `meteringcoCalculated` with
  `taxJarApiKey: ""`. Its July attempt is the only record in
  `recorded-invoices.json` with no invoice number:

  ```json
  { "invoiceId": null, "businessID": "biz_marchetti", "invoiceStatus": "Rejected",
    "error": { "statusCode": 400, "message": "TaxJar API Key is not set" } }
  ```

  Note this fires only for `meteringcoCalculated`: `biz_pinecrest` also has no
  credential and issues normally, because it never needs one.

---

## 5. The quote carries both addresses, the priced lines, and the product category

**Graded:** every field of the `POST /v2/taxes` body, including
`product_tax_code` on each line.

- **Stated** — "going to the authority with both addresses, the priced lines and
  the product category that business sells under".
- **Derivable** — `taxCategory` survives on the settings entity
  (`settings.entity.ts:66`), the read DTO (`read-setting.dto.ts:36`), the Influx
  row (`settingsInfluxTable.entity.ts:41`), the update DTO
  (`update-settings.dto.ts:449`) and both OpenAPI specs. The invoice keeps every
  address component the body needs as `from*`/`to*` fields.
- **Observable** — `tax-authority-log.json` records the full request body of all
  four lookups, field for field, including `shipping: 0` and the
  `product_tax_code` repeated on each line:

  ```json
  { "from_country": "us", "from_zip": "19801", "from_state": "de",
    "from_city": "Wilmington", "from_street": "1209 Orange Street",
    "to_country": "us", "to_zip": "10018", "to_state": "ny",
    "to_city": "New York", "to_street": "412 West 38th Street",
    "shipping": 0,
    "line_items": [{ "quantity": 1, "product_tax_code": "31000", "unit_price": 1250 }, ...] }
  ```

  The category is not cosmetic: `biz_lumen` sells under `40030`, and the rate it
  is quoted (`0.04125` for `cus_ironvale`) is the jurisdiction's rate scaled by
  that category. A solver that omits the code gets a different number back.

---

## 6. The stored rate and tax are exact, not rounded

**Graded:** `salesTaxRate` and `taxAmount` compared to 1e-9.

- **Derivable** — the invoice keeps `totalAmountWithoutTax`, `taxAmount`,
  `salesTaxRate` and `get total()` returning their sum
  (`invoice.entity.ts:328-333, 423`), and persists each as a tag without any
  quantisation (`:937`, `:953-954`, `:966`, `:979-980`).
- **Observable** — `cus_ironvale`'s recorded invoice stores
  `salesTaxRate: 0.04125` and `taxAmount: 56.203125`. Neither survives rounding
  to the cent, and both are reproducible from the lookup logged for it.

---

## 7. An address the authority refuses is reported but does not stop the invoice

**Graded:** the invoice is still created, at rate `0`, and the refusal is
surfaced on the response rather than swallowed.

- **Stated** — "an address the authority refuses must be reported without
  stopping the invoice".
- **Observable** — `cus_seaford` is in the sandbox with a New York state and a
  Miami postcode. `tax-authority-log.json` holds the authority's refusal:

  ```json
  { "response": { "error": "Bad Request",
                  "detail": "to_zip is not a valid postal code for to_state",
                  "status": 400 } }
  ```

  and `recorded-invoices.json` holds the invoice that was issued anyway, with an
  invoice number and `salesTaxRate: 0.0`. The pair is the whole rule: the lookup
  happened, it failed, the invoice exists.

---

## 8. A settled invoice is filed back under its own number

**Graded:** one `POST /v2/transactions/orders` per settled invoice, on the right
environment and credential, with `transaction_id` equal to the invoice number,
`provider: "meteringco"`, the destination address, the net amount and the tax.

- **Stated** — "once an invoice is settled the sale is filed back to the
  authority under that invoice's number so the returns reconcile".
- **Derivable** — the payment path that fires on settlement survives; only the
  tax call inside it was removed. `StripePaymentProcessor.onSuccess` and the
  status transition to `Paid` are intact in
  `src/payment/entities/payment.entity.ts` and `invoice.entity.ts`.
- **Observable** — five filed transactions in `tax-authority-log.json`, each
  matching a `Paid` invoice in `recorded-invoices.json` by
  `transaction_id == invoiceId`:

  ```json
  { "provider": "meteringco", "to_country": "us", "to_zip": "10018", "to_state": "ny",
    "to_city": "New York", "to_street": "412 West 38th Street Floor 6",
    "amount": 1475.0, "shipping": 0.0, "sales_tax": 88.5,
    "transaction_id": "e8baf17d-b259-5107-b42b-9e06e2a81545" }
  ```

  `to_street` shows the two street lines joined with a single space when the
  second is present, and the first line alone when it is not.

### 8a. An incomplete destination is not filed

**Graded:** no transaction for a settled invoice whose destination has no state.
Held out by `verdant-ostergaard-stockholm`.

- **Observable** — `cus_wexley` (Japan) has an empty `state` in `estate.json`.
  Its invoice is `Paid`, yet no filed transaction in `tax-authority-log.json`
  names its street. Six invoices in the recorded month are `Paid` and only five
  are filed; the two missing ones are `cus_wexley`, whose destination has no
  state, and `cus_ashgrove`, whose business holds no credential to file with
  (rule 8b).

### 8b. Filing needs a credential, but its absence is not an error

**Graded:** a settled invoice from a business with no `taxJarApiKey` files
nothing, and settling still succeeds.

- **Observable** — `biz_pinecrest` has `taxJarApiKey: ""`. Its customer
  `cus_ashgrove` has a complete US destination and its invoice reaches `Paid`,
  yet no transaction for it exists in `tax-authority-log.json`. Contrast rule 4:
  a missing credential refuses the invoice only when the business needs the
  authority to price it.

---

## 9. VAT registrations appear only between European parties

**Graded:** the `fromEntity` and `toEntity` blocks stored on the invoice, byte
for byte.

- **Stated** — "invoices between European parties show both sides' VAT
  registrations".
- **Derivable** — the EU country list survives intact as a data file the removal
  orphaned: `src/setting/euCountries.json`, thirty upper-case codes including
  `GB` and `UK`. The surviving address builder in `invoice.entity.ts:487-496`
  shows the exact assembly order and separators, and `CountryLookup` is still
  imported there (`:13`) with its lower-case keys. `vatId` and `customerVatId`
  survive on settings, customer, and both OpenAPI specs.
- **Observable** — the recording carries the rule on both sides of the invoice,
  and the discriminating rows are the two where a party holds a registration and
  still gets no line:

  | party | country | registration held | line printed |
  | --- | --- | --- | --- |
  | `biz_lumen` (seller) | `gb` | `GB 428 6721 09` | yes |
  | `biz_harbourgate` (seller) | `de` | `DE 129 273 060` | yes |
  | `cus_dunmore` (buyer) | `ie` | `IE 6388047V` | yes |
  | `biz_northwind` (seller) | `us` | `US-EIN-51-0793344` | **no** |
  | `cus_ironvale` (buyer) | `us` | `US-TX-99881` | **no** |
  | `cus_hartwell` (buyer) | `us` | none | no |

  `estate.json` shows `biz_northwind` holding a registration; every
  `biz_northwind` block in `recorded-invoices.json` ends with two bare newlines
  and no VAT line. `cus_ironvale` is the same shape on the buyer side. Holding a
  registration is not enough; the country decides, and it decides for each party
  independently.

---

## What is *not* graded

`prepareAddressesForInvoice` and `isEuropeanCountry` are touched by this removal,
which is also true of the round 7 "invoice branding assembly" task in a different
repository. The graded surface here is deliberately different:

- Round 7 grades the **layout** of the address blocks — logo, ordering, the
  branding fields — as an end in itself.
- This task grades the address blocks only where they are **tax identity**: the
  VAT registration line, and only its EU-conditional appearance (rule 9). Layout
  is graded incidentally because the VAT line is appended to a block, not because
  the block is the deliverable. Every other graded check — rules 1 through 8 — is
  about what rate was charged, which authority was asked, what was sent to it,
  and what was filed back. No check reads a logo, a support email, a payment
  term, or a PDF.

A solver who rebuilds branding and nothing else scores zero. A solver who
rebuilds tax determination and appends the VAT line to the surviving block
scores one.
