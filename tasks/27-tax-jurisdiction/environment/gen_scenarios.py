#!/usr/bin/env python3
"""Builds the two estates this task runs against.

The sandbox estate is served to the box and is fully documented: its
configuration, a month of invoices it produced, and the tax authority's own
record of every request the platform made on its behalf. Together those three
files are the worked examples — for any recorded invoice the reader can see the
account settings that produced it, the request that went out, and the number
that came back.

The held-out estate never enters the box. It is a different set of businesses in
different jurisdictions under different credentials, and it is what the verifier
serves. Both are generated from one description by the same model that scores
the run, so the examples the agent reads and the answers the grader holds cannot
drift apart.

This generator does not ship in the image.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import uuid

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "tests"))

from compute_reward import expected_case  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
COUNTRY_LOOKUP = os.path.join(HERE, "workspace", "src", "setting", "countryLookup.json")

# --------------------------------------------------------------------------
# The authority
# --------------------------------------------------------------------------

# Rates are keyed most specific first: country/state/postal, then country/state,
# then country. Sandbox is a test fixture and carries flat rates that do not
# match the real ones, which is the whole point of keeping the two apart.
PRODUCTION_RATES = {
    "us/ny/10018": {"rate": 0.08875, "name": "New York City", "has_nexus": True},
    "us/ny": {"rate": 0.08, "name": "New York", "has_nexus": True},
    "us/ca/94105": {"rate": 0.08625, "name": "San Francisco", "has_nexus": True},
    "us/ca": {"rate": 0.0725, "name": "California", "has_nexus": True},
    "us/tx/78701": {"rate": 0.0825, "name": "Austin", "has_nexus": True},
    "us/tx": {"rate": 0.0625, "name": "Texas", "has_nexus": True},
    "us/wa/98104": {"rate": 0.1025, "name": "Seattle", "has_nexus": True},
    "us/ma/02139": {"rate": 0.0625, "name": "Cambridge", "has_nexus": True},
    "us/il/60601": {"rate": 0.1025, "name": "Chicago", "has_nexus": True},
    "us/fl/33101": {"rate": 0.07, "name": "Miami", "has_nexus": True},
    "us/or": {"rate": 0.0, "name": "Oregon", "has_nexus": True},
    "us/de": {"rate": 0.0, "name": "Delaware", "has_nexus": True},
    "us": {"rate": 0.0, "name": "United States", "has_nexus": False},
    "de": {"rate": 0.19, "name": "Germany", "has_nexus": True},
    "fr": {"rate": 0.20, "name": "France", "has_nexus": True},
    "ie": {"rate": 0.23, "name": "Ireland", "has_nexus": True},
    "gb": {"rate": 0.20, "name": "United Kingdom", "has_nexus": True},
    "nl": {"rate": 0.21, "name": "Netherlands", "has_nexus": True},
    "se": {"rate": 0.25, "name": "Sweden", "has_nexus": True},
    "au": {"rate": 0.10, "name": "Australia", "has_nexus": True},
    "jp": {"rate": 0.10, "name": "Japan", "has_nexus": True},
}

SANDBOX_RATES = {
    "us/ny/10018": {"rate": 0.06, "name": "Test NYC", "has_nexus": True},
    "us/ca/94105": {"rate": 0.06375, "name": "Test SF", "has_nexus": True},
    "us/wa/98104": {"rate": 0.06, "name": "Test Seattle", "has_nexus": True},
    "us/il/60601": {"rate": 0.06, "name": "Test Chicago", "has_nexus": True},
    "us/ma/02139": {"rate": 0.06, "name": "Test Cambridge", "has_nexus": True},
    "us/tx/78701": {"rate": 0.06, "name": "Test Austin", "has_nexus": True},
    "us/or": {"rate": 0.0, "name": "Test Oregon", "has_nexus": True},
    "us": {"rate": 0.06, "name": "Test United States", "has_nexus": True},
    "de": {"rate": 0.12, "name": "Test Germany", "has_nexus": True},
    "fr": {"rate": 0.12, "name": "Test France", "has_nexus": True},
    "ie": {"rate": 0.12, "name": "Test Ireland", "has_nexus": True},
    "gb": {"rate": 0.12, "name": "Test United Kingdom", "has_nexus": True},
    "nl": {"rate": 0.12, "name": "Test Netherlands", "has_nexus": True},
    "se": {"rate": 0.12, "name": "Test Sweden", "has_nexus": True},
    "au": {"rate": 0.06, "name": "Test Australia", "has_nexus": True},
    "jp": {"rate": 0.06, "name": "Test Japan", "has_nexus": True},
}

# A category the authority treats as only partly taxable lowers the rate it
# quotes, which is how forwarding the business' category shows up in the number.
PRODUCT_TAX_CODES = {"31000": 1.0, "40030": 0.5, "81100": 0.0}
CATEGORY_NAMES = {
    "31000": "General Merchandise",
    "40030": "Digital Goods (partially taxable)",
    "81100": "Non-Taxable Service",
}
ZIP_STATE = {
    "10018": "ny",
    "94105": "ca",
    "78701": "tx",
    "98104": "wa",
    "02139": "ma",
    "33101": "fl",
    "60601": "il",
    "19801": "de",
    "97204": "or",
    "75201": "tx",
}


def authority(api_keys: dict[str, str]) -> dict:
    return {
        "api_keys": api_keys,
        "environments": {"sandbox": SANDBOX_RATES, "production": PRODUCTION_RATES},
        "product_tax_codes": PRODUCT_TAX_CODES,
        "zip_state": ZIP_STATE,
        "category_names": CATEGORY_NAMES,
    }


# --------------------------------------------------------------------------
# Estate description
# --------------------------------------------------------------------------


def settings(
    business_id: str,
    name: str,
    line1: str,
    city: str,
    state: str,
    country: str,
    postal: str,
    *,
    line2: str = "",
    vat_id: str = "",
    regime: str = "meteringcoCalculated",
    tax_rate: str = "0",
    category: str = "31000",
    key: str = "",
    account_state: str = "sandbox",
) -> dict:
    return {
        "businessID": business_id,
        "businessName": name,
        "addressLine1": line1,
        "addressLine2": line2,
        "city": city,
        "state": state,
        "country": country,
        "postalCode": postal,
        "vatId": vat_id,
        "taxCalculationType": regime,
        "taxRate": tax_rate,
        "taxCategory": category,
        "taxJarApiKey": key,
        "accountState": account_state,
        "invoiceApproval": "automatic",
        "invoicePaymentTerm": "none",
        "supportEmail": f"billing@{business_id.split('_')[-1]}.example",
        "currency": "USD",
    }


def customer(
    customer_id: str,
    name: str,
    email: str,
    line1: str,
    city: str,
    state: str,
    country: str,
    postal: str,
    *,
    line2: str = "",
    vat_id: str = "",
    exempt: str = "none",
) -> dict:
    return {
        "customerId": customer_id,
        "customerName": name,
        "email": email,
        "taxExempt": exempt,
        "customerVatId": vat_id,
        "address": {
            "streetLineOne": line1,
            "streetLineTwo": line2,
            "city": city,
            "state": state,
            "postalCode": postal,
            "countryCode": country,
        },
    }


PLATFORM = [
    {"name": "Platform subscription", "quantity": 1, "unitCost": 1250},
    {"name": "API calls (millions)", "quantity": 12, "unitCost": 18.75},
]
METERED = [
    {"name": "Ingest volume (GB)", "quantity": 340, "unitCost": 0.85},
    {"name": "Retained series", "quantity": 25, "unitCost": 44.0},
]
SEAT = [
    {"name": "Engineer seats", "quantity": 18, "unitCost": 65},
    {"name": "Support retainer", "quantity": 1, "unitCost": 192.5},
]


def sandbox_estate() -> dict:
    keys = {
        "tjk_sbx_northwind_a41f": "acct_northwind",
        "tjk_prd_lumen_7c30": "acct_lumen",
        "tjk_sbx_harbourgate_9b12": "acct_harbourgate",
    }
    cases = [
        {
            "label": "northwind-hartwell-nyc",
            "settings": settings(
                "biz_northwind", "Northwind Analytics", "1209 Orange Street", "Wilmington", "de", "us", "19801",
                line2="Suite 400", vat_id="US-EIN-51-0793344",
                key="tjk_sbx_northwind_a41f", account_state="sandbox",
            ),
            "customer": customer(
                "cus_hartwell", "Hartwell Media", "ap@hartwell.example",
                "412 West 38th Street", "New York", "ny", "us", "10018", line2="Floor 6",
            ),
            "items": PLATFORM,
            "settle": True,
        },
        {
            "label": "northwind-larkspur-exempt",
            "settings": settings(
                "biz_northwind", "Northwind Analytics", "1209 Orange Street", "Wilmington", "de", "us", "19801",
                line2="Suite 400", vat_id="US-EIN-51-0793344",
                key="tjk_sbx_northwind_a41f", account_state="sandbox",
            ),
            "customer": customer(
                "cus_larkspur", "Larkspur Foundation", "finance@larkspur.example",
                "80 Pine Street", "New York", "ny", "us", "10018", exempt="exempt",
            ),
            "items": SEAT,
            "settle": True,
        },
        {
            "label": "northwind-seaford-bad-postcode",
            "settings": settings(
                "biz_northwind", "Northwind Analytics", "1209 Orange Street", "Wilmington", "de", "us", "19801",
                line2="Suite 400", vat_id="US-EIN-51-0793344",
                key="tjk_sbx_northwind_a41f", account_state="sandbox",
            ),
            "customer": customer(
                "cus_seaford", "Seaford Logistics", "ar@seaford.example",
                "77 Water Street", "New York", "ny", "us", "33101",
            ),
            "items": PLATFORM,
            "settle": False,
        },
        {
            "label": "northwind-wexley-no-state",
            "settings": settings(
                "biz_northwind", "Northwind Analytics", "1209 Orange Street", "Wilmington", "de", "us", "19801",
                line2="Suite 400", vat_id="US-EIN-51-0793344",
                key="tjk_sbx_northwind_a41f", account_state="sandbox",
            ),
            "customer": customer(
                "cus_wexley", "Wexley KK", "keiri@wexley.example",
                "2-4-9 Umeda", "Osaka", "", "jp", "5300001",
            ),
            "items": METERED,
            "settle": True,
        },
        {
            "label": "lumen-ironvale-austin",
            "settings": settings(
                "biz_lumen", "Lumen Grid Ltd", "12 Finsbury Square", "London", "", "gb", "EC2A 1AS",
                vat_id="GB 428 6721 09", category="40030",
                key="tjk_prd_lumen_7c30", account_state="production",
            ),
            "customer": customer(
                "cus_ironvale", "Ironvale Systems", "ap@ironvale.example",
                "301 Congress Avenue", "Austin", "tx", "us", "78701", vat_id="US-TX-99881",
            ),
            "items": SEAT,
            "settle": True,
        },
        {
            "label": "harbourgate-dunmore-manual",
            "settings": settings(
                "biz_harbourgate", "Harbourgate Systems GmbH", "Rosenthaler Strasse 40", "Berlin", "", "de", "10178",
                vat_id="DE 129 273 060", regime="manual", tax_rate="0.19", category="",
                key="tjk_sbx_harbourgate_9b12", account_state="sandbox",
            ),
            "customer": customer(
                "cus_dunmore", "Dunmore Trading", "accounts@dunmore.example",
                "25 Sir John Rogerson's Quay", "Dublin", "Leinster", "ie", "D02 X285", vat_id="IE 6388047V",
            ),
            "items": PLATFORM,
            "settle": True,
        },
        {
            "label": "harbourgate-fairholme-exempt-manual",
            "settings": settings(
                "biz_harbourgate", "Harbourgate Systems GmbH", "Rosenthaler Strasse 40", "Berlin", "", "de", "10178",
                vat_id="DE 129 273 060", regime="manual", tax_rate="0.19", category="",
                key="tjk_sbx_harbourgate_9b12", account_state="sandbox",
            ),
            "customer": customer(
                "cus_fairholme", "Fairholme Bildungswerk", "buchhaltung@fairholme.example",
                "Alexanderplatz 7", "Berlin", "Berlin", "de", "10178",
                vat_id="DE 305 118 947", exempt="exempt",
            ),
            "items": SEAT,
            "settle": True,
        },
        {
            "label": "marchetti-caldwell-no-credential",
            "settings": settings(
                "biz_marchetti", "Marchetti Interactive", "88 Kearny Street", "San Francisco", "ca", "us", "94108",
                regime="meteringcoCalculated", category="31000", key="", account_state="sandbox",
            ),
            "customer": customer(
                "cus_caldwell", "Caldwell Studios", "ap@caldwell.example",
                "1355 Market Street", "San Francisco", "ca", "us", "94103",
            ),
            "items": PLATFORM,
            "settle": False,
        },
        {
            "label": "pinecrest-ashgrove-no-regime",
            "settings": settings(
                "biz_pinecrest", "Pinecrest Labs", "600 1st Avenue", "Seattle", "wa", "us", "98104",
                regime="", tax_rate="0.07", category="31000", key="", account_state="sandbox",
            ),
            "customer": customer(
                "cus_ashgrove", "Ashgrove Retail", "ap@ashgrove.example",
                "1200 5th Avenue", "Seattle", "wa", "us", "98104",
            ),
            "items": METERED,
            "settle": True,
        },
    ]
    return {"keys": keys, "cases": cases}


def holdout_estate() -> dict:
    keys = {
        "tjk_sbx_calloway_5e83": "acct_calloway",
        "tjk_prd_verdant_2a19": "acct_verdant",
        "tjk_sbx_ostara_6d44": "acct_ostara",
    }
    calloway = dict(
        business_id="biz_calloway", name="Calloway Instrumentation", line1="245 Main Street",
        city="Cambridge", state="ma", country="us", postal="02139",
        vat_id="US-EIN-84-2213097", category="31000",
        key="tjk_sbx_calloway_5e83", account_state="sandbox",
    )
    verdant = dict(
        business_id="biz_verdant", name="Verdant Signal Ltd", line1="1 Grand Canal Square",
        city="Dublin", state="", country="ie", postal="D02 P820",
        vat_id="IE 9825613N", category="40030",
        key="tjk_prd_verdant_2a19", account_state="production",
    )
    cases = [
        {
            "label": "calloway-marlowe-sanfrancisco",
            "settings": settings(**calloway),
            "customer": customer(
                "cus_marlowe", "Marlowe Robotics", "ap@marlowe.example",
                "500 Howard Street", "San Francisco", "ca", "us", "94105", line2="Suite 210",
            ),
            "items": PLATFORM,
            "settle": True,
        },
        {
            "label": "calloway-tarrant-exempt-chicago",
            "settings": settings(**calloway),
            "customer": customer(
                "cus_tarrant", "Tarrant Civic Trust", "finance@tarrant.example",
                "233 South Wacker Drive", "Chicago", "il", "us", "60601", exempt="exempt",
            ),
            "items": SEAT,
            "settle": True,
        },
        {
            "label": "calloway-ellery-postcode-mismatch",
            "settings": settings(**calloway),
            "customer": customer(
                "cus_ellery", "Ellery Foods", "ar@ellery.example",
                "1 Front Street", "San Francisco", "ca", "us", "60601",
            ),
            "items": METERED,
            "settle": False,
        },
        {
            "label": "verdant-ostergaard-stockholm",
            "settings": settings(**verdant),
            "customer": customer(
                "cus_ostergaard", "Ostergaard Kraft AB", "faktura@ostergaard.example",
                "Kungsgatan 8", "Stockholm", "", "se", "111 22", vat_id="SE 556036 0793",
            ),
            "items": PLATFORM,
            "settle": True,
        },
        {
            "label": "verdant-fenwick-london",
            "settings": settings(**verdant),
            "customer": customer(
                "cus_fenwick", "Fenwick Analytics Ltd", "ap@fenwick.example",
                "40 Bowling Green Lane", "London", "", "gb", "EC1V 9BW", vat_id="GB 245 7761 30",
            ),
            "items": SEAT,
            "settle": False,
        },
        {
            "label": "verdant-navarro-sydney",
            "settings": settings(**verdant),
            "customer": customer(
                "cus_navarro", "Navarro Pty Ltd", "accounts@navarro.example",
                "55 Pitt Street", "Sydney", "nsw", "au", "2000", vat_id="AU 51 824 753 556",
            ),
            "items": METERED,
            "settle": True,
        },
        {
            "label": "verdant-quillon-osaka-no-state",
            "settings": settings(**verdant),
            "customer": customer(
                "cus_quillon", "Quillon KK", "keiri@quillon.example",
                "1-1-88 Oyodonaka", "Osaka", "", "jp", "5310076",
            ),
            "items": PLATFORM,
            "settle": True,
        },
        {
            "label": "ostara-bellhaven-manual",
            "settings": settings(
                "biz_ostara", "Ostara Netwerk BV", "Keizersgracht 555", "Amsterdam", "", "nl", "1017 DR",
                vat_id="NL 8123 45 678 B01", regime="manual", tax_rate="0.21", category="",
                key="tjk_sbx_ostara_6d44", account_state="sandbox",
            ),
            "customer": customer(
                "cus_bellhaven", "Bellhaven Havens BV", "crediteuren@bellhaven.example",
                "Weena 505", "Rotterdam", "Zuid-Holland", "nl", "3013 AL", vat_id="NL 8099 12 345 B01",
            ),
            "items": SEAT,
            "settle": True,
        },
        {
            "label": "ostara-pelham-exempt-manual",
            "settings": settings(
                "biz_ostara", "Ostara Netwerk BV", "Keizersgracht 555", "Amsterdam", "", "nl", "1017 DR",
                vat_id="NL 8123 45 678 B01", regime="manual", tax_rate="0.21", category="",
                key="tjk_sbx_ostara_6d44", account_state="sandbox",
            ),
            "customer": customer(
                "cus_pelham", "Pelham Onderwijs Stichting", "financien@pelham.example",
                "Sint Jacobsstraat 200", "Utrecht", "Utrecht", "nl", "3511 BT",
                vat_id="NL 8044 55 123 B01", exempt="exempt",
            ),
            "items": PLATFORM,
            "settle": True,
        },
        {
            "label": "tidewell-marchmont-no-regime",
            "settings": settings(
                "biz_tidewell", "Tidewell Compute", "1301 2nd Avenue", "Seattle", "wa", "us", "98104",
                regime="", tax_rate="0.0625", category="31000", key="", account_state="sandbox",
            ),
            "customer": customer(
                "cus_marchmont", "Marchmont Health", "ap@marchmont.example",
                "701 Pike Street", "Seattle", "wa", "us", "98104",
            ),
            "items": METERED,
            "settle": True,
        },
        {
            "label": "solano-ridley-no-credential",
            "settings": settings(
                "biz_solano", "Solano Edge Inc", "2100 Ross Avenue", "Dallas", "tx", "us", "75201",
                regime="meteringcoCalculated", category="31000", key="", account_state="sandbox",
            ),
            "customer": customer(
                "cus_ridley", "Ridley Freightworks", "ap@ridley.example",
                "400 South Record Street", "Dallas", "tx", "us", "75201",
            ),
            "items": SEAT,
            "settle": False,
        },
    ]
    return {"keys": keys, "cases": cases}


# --------------------------------------------------------------------------
# Rendering
# --------------------------------------------------------------------------


def recorded_month(estate: dict, country_names: dict) -> tuple[list, list, list]:
    """Replay the estate through the model to produce the sandbox's history."""
    auth = authority(estate["keys"])
    rng = uuid.UUID("6f1d0a54-3c77-4a9e-9d1b-0c2f5e8a7b40")
    invoices: list = []
    calls: list = []
    orders: list = []
    day = 3
    for index, case in enumerate(estate["cases"]):
        want = expected_case(case, auth, country_names)
        invoice_id = str(uuid.uuid5(rng, case["label"]))
        issued = f"2026-07-{day:02d}T09:15:00.000Z"
        day += 2
        record = {
            "invoiceId": invoice_id,
            "businessID": case["settings"]["businessID"],
            "customerId": case["customer"]["customerId"],
            "invoiceDate": issued,
            "invoiceStatus": "Paid" if case.get("settle") else "Open",
            "currency": "USD",
            "invoiceLineItems": case["items"],
            "totalAmountWithoutTax": want["totalAmountWithoutTax"],
            "salesTaxRate": want["salesTaxRate"],
            "taxAmount": want["taxAmount"],
            "total": want["total"],
            "fromEntity": want["fromEntity"],
            "toEntity": want["toEntity"],
        }
        if want["creation_fails"]:
            record = {
                "invoiceId": None,
                "businessID": case["settings"]["businessID"],
                "customerId": case["customer"]["customerId"],
                "invoiceDate": issued,
                "invoiceStatus": "Rejected",
                "error": {"statusCode": 400, "message": "TaxJar API Key is not set"},
            }
        elif want["absorbed_error"]:
            record["warning"] = "WARNING Errors occured while generating invoice, invoice still generated"
        invoices.append(record)

        if want["taxes_call"] is not None:
            call = want["taxes_call"]
            calls.append(
                {
                    "at": issued,
                    "environment": call["environment"],
                    "resource": "taxes",
                    "method": "POST",
                    "api_key": call["api_key"],
                    "request": call["body"],
                    "response": (
                        {
                            "error": "Bad Request",
                            "detail": "to_zip is not a valid postal code for to_state",
                            "status": 400,
                        }
                        if want["absorbed_error"]
                        else {"tax": {"rate": want["salesTaxRate"], "amount_to_collect": round(want["taxAmount"], 2)}}
                    ),
                }
            )
        if want["order"] is not None:
            order = dict(want["order"])
            key = order.pop("api_key")
            order["transaction_id"] = invoice_id
            orders.append(
                {
                    "at": issued,
                    "environment": order.pop("environment"),
                    "resource": "transactions/orders",
                    "method": "POST",
                    "api_key": key,
                    "request": order,
                }
            )
        index += 1
    return invoices, calls, orders


def write(path: str, payload) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2, sort_keys=False)
        handle.write("\n")
    print(f"wrote {path}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", default=HERE)
    args = parser.parse_args()

    with open(COUNTRY_LOOKUP, encoding="utf-8") as handle:
        country_names = json.load(handle)

    sandbox = sandbox_estate()
    holdout = holdout_estate()

    write(os.path.join(args.out, "sandbox", "public.json"), {"region": "us-east-1", "tax_authority": authority(sandbox["keys"])})
    write(os.path.join(args.out, "verifier-data", "holdout.json"), {"region": "us-east-1", "tax_authority": authority(holdout["keys"])})
    write(os.path.join(args.out, "verifier-data", "run-spec.json"), {"cases": holdout["cases"]})
    write(os.path.join(args.out, "verifier-data", "countryLookup.json"), country_names)

    invoices, calls, orders = recorded_month(sandbox, country_names)
    write(
        os.path.join(args.out, "sandbox", "estate.json"),
        {
            "note": "Configuration of the accounts this box serves, as the settings and customer APIs return them.",
            "settings": list({case["settings"]["businessID"]: case["settings"] for case in sandbox["cases"]}.values()),
            "customers": [case["customer"] for case in sandbox["cases"]],
        },
    )
    write(
        os.path.join(args.out, "sandbox", "recorded-invoices.json"),
        {
            "note": "Invoices these accounts issued in July 2026, as stored.",
            "invoices": invoices,
        },
    )
    write(
        os.path.join(args.out, "sandbox", "tax-authority-log.json"),
        {
            "note": (
                "The tax authority's own record of every request the platform made for these accounts "
                "in July 2026. Correlate by to_street with recorded-invoices.json."
            ),
            "rate_lookups": calls,
            "filed_transactions": orders,
        },
    )


if __name__ == "__main__":
    main()
