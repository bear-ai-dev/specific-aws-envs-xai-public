# Task 31 — customer onboarding

## Headline result

| Model | Solves `c/n` | pass@1 | pass@3 | pass@8 |
| --- | ---: | ---: | ---: | ---: |
| Grok 4.6 | 0/8 | 0.0000 | 0.0000 | 0.0000 |
| Opus 5 | 5/8 | 0.6250 | 0.9821 | 1.0000 |

## The capability, in a sentence

Taking a new customer onto a business: admitting the request against the
caller's customer allowance, settling on an identifier the business is not
already using, putting the customer on the business' own connected payment
rail when they pay by card, opening and enrolling the contract for the offering
they signed up to, persisting the customer with its opening balance and free
trial, metering the onboarding, and announcing the new customer downstream.

## What this is not

This is not organization invite email — adding a person to an existing Auth0
organization and mailing them — and it is not datastore access provisioning,
minting an IAM role and a prefix-scoped S3 policy so a customer's own AWS
account can drop usage. Neither of those is a customer.

This task is the other side of the account: what a *business* does when a
*paying customer* arrives. No Auth0 organization, no invitation, no email, no
IAM, no S3 policy, no role. The graded surface is the allowance gate, the
identifier, the Stripe Connect payment rail, the contract, the persisted
configuration row, metering and the webhook. `OrganizationEntity`,
`UserEntity.updateUserPermissions` and everything under
`src/measurement-config/` are untouched.

## The removal

Measured as `diff -ru environment/pristine environment/workspace`, excluding
`node_modules`:

| file | lines removed | lines changed in place |
| --- | ---: | ---: |
| `src/customer/customer.service.ts` | 201 | 2 |
| `src/onboarding/onboarding.service.ts` | 102 | 0 |
| `src/users/entities/onboarding.entity.ts` | 102 | 0 |
| `src/onboarding/onboarding.controller.ts` | 98 | 0 |
| `src/customer/customer.controller.ts` | 51 | 1 |
| `src/onboarding/dto/onboarding.dto.ts` | 41 | 0 |
| `src/onboarding/onboarding.controller.spec.ts` | 27 | 0 |
| `src/onboarding/onboarding.service.spec.ts` | 22 | 0 |
| `src/portal/portal.controller.ts` | 16 | 0 |
| `src/portal/portal.service.ts` | 15 | 0 |
| `src/onboarding/onboarding.module.ts` | 12 | 0 |
| `src/portal/dto/createCustomerOnboarding.dto.ts` | 10 | 0 |
| `src/users/users.controller.ts` | 9 | 1 |
| `src/app.module.ts` | 2 | 0 |
| `src/openApiSpecGenerator.ts` | 2 | 0 |
| `src/users/users.module.ts` | 2 | 1 |
| `src/onboarding/entities/onboarding.entity.ts` | 1 | 0 |
| **total** | **713** | **5** |

**713 lines across 17 files. That is the honest ceiling for this capability,
not a padded removal.** See "Why not 1,000" below.

What went, by piece:

- `CustomerService.create` (134 lines) and `CustomerService.remove` (56) —
  taking a customer on and off a business.
- `PublicAPICustomerController` `POST /` and `DELETE /:customerId` — the two
  routes that reached them.
- The whole `src/onboarding/` module (302 lines across six files) — a business
  connecting, re-checking and disconnecting its own Stripe account, which is
  the payment rail a card customer is created on.
- `OnboardingEntity.onboardNewUserToDogfood` (102) and its wiring in
  `UsersController.userRedirect` — the platform provisioning itself a customer
  for a newly onboarded business.
- `PortalService.createCustomer` and `POST /portal/customer` — self-serve
  onboarding from the customer-facing portal.
- The module and OpenAPI-generator registrations that referenced the above.

Two `create` tests in `src/customer/customer.service.spec.ts` were deliberately
**kept**. They pin the entry point and the allowance rule, which costs 39 lines
of removal and buys a much fairer task; see row 1 of `DISCOVERABILITY.md`.

## No invented code

Every symbol and field central to the removal already exists in the shared
upstream tree. Counted with `rg -c` over
`meteringco-src/extracted/top-up-billing-lifecycle/{src,README.md}`:

| symbol | hits | files |
| --- | ---: | ---: |
| `determineIfEntitlementExceeded` | 17 | 6 |
| `getLatestCustomer` | 37 | 6 |
| `stripeAccountId` | 90 | 15 |
| `shouldCreateStripeCustomer` | 9 | 2 |
| `createStripeCustomer` | 3 | 2 |
| `enrollCustomerInContract` | 5 | 4 |
| `readSettingsResponseData` | 19 | 4 |
| `usageOverrides` | 33 | 5 |
| `prepaidCredit` | 63 | 11 |
| `offeringEnrollmentDate` | 161 | 22 |
| `freeTrialStartDate` | 41 | 9 |
| `overridesForOffering` | 40 | 9 |
| `paymentChannelOptions` | 54 | 7 |
| `portalUrl` | 17 | 6 |
| `CustomerEntity.transformer` | 3 | 1 |
| `loadPoints` | 93 | 32 |
| `ReadCustomerResponseData` | 138 | 18 |
| `CreateCustomerResponseDto` | 10 | 6 |
| `onboardNewUserToDogfood` | 2 | 2 |
| `generateStripeState` | 3 | 3 |
| `STRIPE_PROD_CLIENT_ID` | 3 | 2 |
| `AuditScope.ERROR` | 86 | 42 |
| `WebhookProcessorEventType.Standard` | 13 | 7 |
| `EntitlementTypes.CUSTOMERS` | 1 | 1 |
| `WebhookType.CUSTOMER_CREATED` | 1 | 1 |
| `TokenType.customer` | 2 | 2 |
| `CustomerConfig` | 1 | 1 |

The four single- and double-hit rows are the point of the design rather than a
weakness: those are the enum members and the measurement name whose *only*
call site was inside the removed method. The member declarations survive, the
sibling services show the pattern with a different member of the same enum
(`EntitlementTypes.OFFERINGS`, `TokenType.offering`, `CUSTOMER_UPDATED`), and
the sandbox archive shows the removed method's own output using them. Not one
line of the removal was authored for this task.

## The design tool: siblings as the specification

The removed method is one of five parallel `create` implementations in the
tree. `OfferingService.create`
(`environment/workspace/src/offering/offering.service.ts:122-188`) is the
closest: it shares the allowance gate, the `${STAGE}-config` write and the
metering block with its audit fallback, for offerings instead of customers.
`DimensionsService.create`, `ServicesService.create`, `CreditService.create` and
`ContractService.create` fill in the rest. `CustomerService.update`, which
survives untouched, calls both surviving `CustomerEntity` Stripe statics with
the same arguments the removed `create` did.

On top of that: the generated OpenAPI spec still documents `POST /customers`
with `CreateCustomerDto` in and `CreateCustomerResponseDto` out and exactly two
outcomes, `201` and `400`; two `create` tests survive in the customer spec; and
the sandbox carries a month of the reference implementation's own output.

### How much of the answer the sibling is

Measured, not asserted, because a sibling that hands over the computation is the
answer rather than the specification. `.local/imitation-check.py` normalises
whitespace, comments, string literals and the entity vocabulary — so a line
differing only in which entity it names counts as identical — and scans the
removed method against all **345** surviving method definitions in the tree.

| comparison | normalised lines aligned |
| --- | ---: |
| control: `OfferingService.create` against itself | 100.0% |
| control: upstream's own two closest siblings, `OfferingService.create` vs `DimensionsService.create` | 29.2% |
| **removed `CustomerService.create` vs `OfferingService.create`** | **20.8%** |
| the same, measured the generous way round (how much of the sibling reappears in the removed method) | 45.8% |
| the closest of the other 344 survivors | below 20.8% |

The removed method is 106 normalised lines and the sibling is 48, so the sibling
cannot account for more than a fifth of what had to be written, and it scores
*below* the 29.2% that upstream's own two most-parallel `create` methods reach
against each other. What it hands over is the surrounding shape: the allowance
gate, the `loadPoints` destructure, and the metering `try`/`catch` with its
audit. What it has no analogue for is everything the capability consists of —
the identifier collision check, the settings read, the payment-rail
precondition, the contract and enrolment, the rail customer, the row assembly
carrying the balance and the trial, and the announcement.

### The imitation variant

The stronger test: transplant the sibling into a customer-shaped shell, change
only what the type system and the data force, reason about onboarding not at
all, and score it. Built generously — every forced substitution resolved the way
that helps the imitator most, including `EntitlementTypes.CUSTOMERS`,
`TokenType.customer`, `CustomerEntity.transformer` for the row, and the
dimensions sibling's richer audit payload that names the entity's own id.
`.local/build-imitation.py` produces it.

It scores **0.0**, passing **1 of 12** graded requests — the pure allowance
refusal, which is the one request that is entirely scaffold. It reaches 11 of
the 25 rules and misses 14: rules 4, 5, 6, 8, 9, 10, 11, 13, 14, 18, 19, 20, 21
and 25. Two of the 11 it "reaches" it reaches vacuously — it never creates a
rail customer and never opens a contract, so the negative halves of rules 12 and
15 hold by accident, at the cost of failing their positive halves.

Against the five rules a first draft misses, the variant gets **one** free: the
metering `try`/`catch` (rule 23) transplants intact, and so does the
audit-on-failure and no-audit-on-success pair around it. The rail customer
chosen for the row, the opening balance and the trial start are all missed. And
the fifth — a refusal provisions nothing — is not merely missed but **inverted**:
having no failure path to copy, the imitator persisted and metered a customer
under an identifier the business was already using, and persisted and metered a
card customer on a business that never connected its payment account. It
reported both as successful onboardings. A sibling that shares the surrounding
computation while being wrong about the removed behaviour is the safe case, and
this is that case.

## Grading

Binary. Twelve onboarding requests against a business the submission has never
seen; every one must behave correctly. Twenty-five rules, each with its route
and evidence, are tabulated in `DISCOVERABILITY.md`.

The verifier (`tests/test.sh`) runs as root, kills the agent-facing emulator,
proves the port is free by binding it, starts its own emulator with an admin
token only it knows, and drives `/app` with a root-installed driver
(`environment/verifier-data/drive.ts`) under `env -i` as the `agent` user. The
driver stubs the collaborators — they answer with the state each request is
supposed to meet and record what they were asked to do — and builds influx
points with the project's real `CustomerEntity.transformer`, rendering them to
line protocol. It writes its record of each request both to a file and into an
object store served only by the verifier's own process; `tests/compute_reward.py`
reads the store copy back, refuses any request whose two records disagree, and
then works out from the request inputs what should have happened. It loads no
submitted code and never reads an exit code or stdout.

## Verification (no Docker)

Run against the vendored emulator started directly, driving with `tsx`, using
`.local/verify.sh`. `.local/` is gitignored scaffolding, not part of the task;
it needs `npm install --ignore-scripts` in one tree first, which the staged
trees symlink to for dependencies only. Each candidate is a real byte copy
(`tar | tar`) into its own freshly removed directory — never `cp -c` or a
reflink — and no candidate shares any source file with another, which is why
the untouched workspace reads 0.0 rather than inheriting a neighbour's writes.

| submission | reward | note |
| --- | ---: | --- |
| oracle (upstream `src/`) | **1.0** | all 12 requests correct |
| `solution/solve.sh` applied to the shipped workspace | **1.0** | all 12 requests correct |
| untouched workspace | **0.0** | wrong answer, not a crash: 12/12 wrong, first reason "the customer allowance was consulted once: expected 1, saw 0" |
| structurally different implementation | **1.0** | whole flow moved into a new `CustomerOnboarding` class in a new file, two-line delegate left behind; differs in mechanism, not only layout: `node:crypto` `randomUUID` instead of `uuid` `v4`, the rail decision taken from its own table instead of by calling `CustomerEntity.shouldCreateStripeCustomer`, the rail customer opened *before* the contract instead of after, and metering kept non-fatal with `Promise.allSettled` instead of `try`/`catch` |

Ten wrong readings, each a single behavioural change, each failing for its own
reason:

| # | wrong reading | reward | first reason reported |
| ---: | --- | ---: | --- |
| 1 | allowance never checked | 0.0 | `entitlement-reached`: an exhausted allowance is refused: expected False, saw True |
| 2 | caller's identifier ignored, always generated | 0.0 | `caller-supplied-id-free`: a free caller-supplied id is honoured: expected `nw-1042`, saw a UUID |
| 3 | no check for an identifier already in use | 0.0 | `caller-supplied-id-taken`: a taken customer id is refused: expected False, saw True |
| 4 | card customers allowed with no connected account | 0.0 | `stripe-without-connect`: billing a card with no connected account is refused: expected False, saw True |
| 5 | rail customer created even when the caller brought one | 0.0 | `stripe-caller-brought-its-own-customer`: no payment-rail customer is created: expected `[]` |
| 6 | new rail customer created but not persisted | 0.0 | `stripe-on-connected-business`: the row carries the payment-rail customer that will be billed: expected `cus_QeR8zTn1WkP2Lm`, saw None |
| 7 | metering failure allowed to fail the request | 0.0 | `token-metering-unavailable`: the request succeeds: expected True, saw False |
| 8 | no announcement published | 0.0 | `manual-no-offering`: the new customer is announced once: expected 1, saw 0 |
| 9 | prepaid credit not used to open the balance | 0.0 | `offering-with-prepaid-credit`: prepaid credit from the contract opens the balance: expected `500.00`, saw None |
| 10 | free trial start always set | 0.0 | `manual-no-offering`: no free trial start without a free trial |

Also confirmed: the sandbox holds an instance of every one of the twenty case
classes the scorer distinguishes (`.local/coverage.py`, which enumerates them
and fails if any is unrepresented); sandbox and graded identifiers are wholly
disjoint (`biz_apex`/`apx-*`/`acct_1LqW8T…` against
`biz_northwind`/`nw-*`/`acct_1PmQ4Z…`, zero overlap); `gen_scenarios.py`
reproduces `verifier-data/holdout.json` and `verifier-data/run-spec.json`
byte-for-byte; and the scorer fails closed — with the driver's output removed it
reports "the submission produced no readable observations" at 0.0 rather than
passing.

## Why not 1,000 lines

Measured, not estimated. The coherent capability is 713 lines. The four ways to
reach 1,000 were all rejected:

1. **Author code and remove it.** Forbidden, and the failure mode is known.
2. **Annex `OrganizationService.create` and `OrganizationEntity`'s Auth0
   provisioning** (~250 lines). This is round 7's module, its invite path lives
   in the same class, and every line of it is an Auth0 HTTP call that cannot be
   graded from this box.
3. **Annex the rest of `setting/`** — profile updates, invoice image upload,
   free-trial administration, the 544-line settings DTO. Real code, but not
   customer onboarding; it would buy line count at the cost of "one coherent
   capability".
4. **Annex `services/` or `customergroup/`.** Provisioning of a different kind;
   same objection.

Padding the removal to a round thousand would mix in work that is not customer
onboarding. The task is kept as it is, reported at 713.

### The other honest limit

Of the 713 lines, roughly 190 — `CustomerService.create` and the response
contract — are graded. `CustomerService.remove`, the Stripe Connect module, the
portal self-serve route and the dogfood provisioning were removed because
leaving them behind would make the tree incoherent (a product that can delete
customers but not create them), not because they are graded. They are not:
`remove` needs `Offering.getInstance(...).unenroll` and a live exchange-rate
lookup, the Connect module and the dogfood path need Stripe OAuth and Auth0,
and requiring a deleted module back at an exact path and class name would be
grading structure rather than behaviour. A submission that restores onboarding
and nothing else scores 1.0, which is what the prompt asks for.

## Difficulty

Against the fewer-than-4-solves-in-8 target, my estimate is **1-2 solves in 8**.

Arguing for difficulty: 25 rules must all hold at once and the reward is
binary; five of them (the rail customer chosen for the row, the opening
balance, the trial start, the metering try/catch, the refusal that provisions
nothing) are the kind of detail a first draft misses; the rules are spread
across the allowance system, the contract service, the payment rail, influx,
the token consumer, the audit stream and the webhook stream; and nothing in the
prompt names a single symbol.

The archive used to be the ladder that made this a 2-4. It has been cut from
eleven fully worked onboardings to six — one per case class the grader
distinguishes, which is the floor — and each surviving record no longer carries
the arguments the reference passed its collaborators, only its inputs and what
left the service. Six rules that were previously readable off a call transcript
(the entitlement type, the customer lookup, the settings read, the contract
arguments, the enrolment arguments, the metering payload) are now derivable
only, from signatures and enum members in the surviving tree. Two of the five
first-draft-miss rules now have to be reached by contrast rather than by
copying: the balance and the trial each appear in one record and are absent in
the other, so neither convention can be read off a single row without noticing
which input it tracks.

What still argues against: the two surviving `create` tests remove any doubt
about the entry point and the allowance gate, and both the sibling and
`card-with-an-existing-rail-customer.ndjson` hand over the metering try/catch
rule. Both are deliberate fairness choices and they are staying.

The sibling is measured rather than assumed, above: an imitator that transplants
it and reasons about onboarding not at all scores 0.0 on 11 of 12 requests and
reaches 11 of 25 rules. The skeleton is free; the capability is not. That is the
device working as intended, and it is the reason the estimate rests on the
fourteen rules the sibling cannot supply rather than on the archive.

The likeliest failure mode for a strong model remains a negative rule rather
than the capability — not creating a rail customer for a caller who brought one,
not recording a trial start without a trial, not opening a balance without
prepaid credit. Each of those still has its evidence: the caller-brought record
is on a **connected** business, so a rail customer was available to open and was
not opened; and the balance and trial each have a record where the contract
offered one and did not offer the other.

## Layout

```
instruction.md                    the prompt (993 characters, one paragraph)
task.toml                         harness manifest
DISCOVERABILITY.md                25 graded rules, route and evidence each
environment/
  Dockerfile                      image; verifier material is root-only 0600
  task-init.sh                    starts the sandbox emulator, then idles
  gen_scenarios.py                authors the estates and the graded requests
  mockaws/                        vendored emulator (not writable by the agent)
  hardening/                      pty hardening for large pasted files
  sandbox/                        the estate the agent sees, plus its README
  sandbox-run-spec.json           the requests the archive was recorded from
  verifier-data/                  held-out estate, graded requests, driver
  workspace/                      the deliverable, as the agent receives it
solution/
  solution.patch                  restores the removed capability
  solve.sh                        applies it
tests/
  test.sh                         verifier entry point (root)
  compute_reward.py               binary reward, no submitted code loaded
```

## Rebuilding the recorded sandbox archive

```
# 1. an oracle tree: the workspace with the capability restored
cp -a environment/workspace /tmp/oracle && solution/solve.sh /tmp/oracle
# 2. drive it with the sandbox requests, then fold the result into the estate
#    (see .local/verify.sh for the driver invocation)
python3 environment/gen_scenarios.py --recorded /tmp/sandbox-observed.json
```

`gen_scenarios.py` scrubs absolute paths out of anything it embeds, so no host
path reaches the image.
