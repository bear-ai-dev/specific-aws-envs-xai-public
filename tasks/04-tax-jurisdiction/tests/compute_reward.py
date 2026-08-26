#!/usr/bin/env python3
"""Trusted scorer for the tax determination task.

Runs as root, loads no submitted code, and works out for itself what every
graded invoice owed and what the platform should have asked the tax authority.
It is handed two things: the records the driver observed, and the authority's
own log read straight off the emulator over an admin channel the agent has no
token for. Reward is 1.0 only if every case agrees on every check.

The model below is the single source of truth for the task. `gen_scenarios.py`
imports it to produce the sandbox estate, so the worked examples the agent can
read and the answers the grader holds cannot drift apart.
"""
# TEST_CASE_COVERAGE_START
# CASE calloway-marlowe-sanfrancisco: destination tax uses production authority inputs and files the settled sale
# CASE calloway-tarrant-exempt-chicago: customer exemption overrides destination taxation
# CASE calloway-ellery-postcode-mismatch: authority address refusal is reported without stopping invoice issue
# CASE verdant-ostergaard-stockholm: sandbox destination taxation includes both European VAT registrations
# CASE verdant-fenwick-london: destination taxation handles a European seller and non-European buyer
# CASE verdant-navarro-sydney: destination taxation forwards address, lines, and product category outside Europe
# CASE verdant-quillon-osaka-no-state: destination requests work when a jurisdiction has no state field
# CASE ostara-bellhaven-manual: a business-maintained rate computes tax without an authority lookup
# CASE ostara-pelham-exempt-manual: exemption overrides a manually maintained business rate
# CASE tidewell-marchmont-no-regime: a business configured to collect nothing produces zero tax
# CASE solano-ridley-no-credential: missing authority credentials fail safely without inventing a tax result
# TEST_CASE_COVERAGE_END

from __future__ import annotations

import argparse
import json
import os
from decimal import ROUND_HALF_UP, Decimal
from typing import Any

TOLERANCE = 1e-9

# --------------------------------------------------------------------------
# The model
# --------------------------------------------------------------------------


def js_to_fixed(value: float, digits: int = 2) -> float:
    """`Number(x.toFixed(digits))` — ties away from zero on the exact double."""
    quantum = Decimal(1).scaleb(-digits)
    return float(Decimal(value).quantize(quantum, rounding=ROUND_HALF_UP))


def subtotal_of(items: list[dict[str, Any]]) -> float:
    """`Invoice.calculateTotalAmountWithoutTax`, which survives in the tree."""
    total = 0.0
    for line in items:
        total += float(line["quantity"]) * float(line["unitCost"])
    fixed = js_to_fixed(total, 2)
    return 0.0 if fixed < 0 else fixed


def environment_for(settings: dict[str, Any]) -> str:
    return "production" if settings.get("accountState") == "production" else "sandbox"


def rate_lookup(authority: dict[str, Any], environment: str, country: str, state: str, postal: str) -> dict[str, Any]:
    table = authority["environments"].get(environment, {})
    country = (country or "").strip().lower()
    state = (state or "").strip().lower()
    postal = (postal or "").strip().upper()
    for candidate in (f"{country}/{state}/{postal}", f"{country}/{state}", country):
        if candidate in table:
            return table[candidate]
    return {"rate": 0.0, "has_nexus": False}


def address_problem(authority: dict[str, Any], body: dict[str, Any]) -> str | None:
    to_country = str(body.get("to_country") or "").strip()
    if not to_country:
        return "to_country is required"
    if not str(body.get("from_country") or "").strip():
        return "from_country is required"
    if to_country.lower() == "us":
        to_zip = str(body.get("to_zip") or "").strip()
        to_state = str(body.get("to_state") or "").strip().lower()
        if not to_zip:
            return "to_zip is required when to_country is US"
        if not to_state:
            return "to_state is required when to_country is US"
        owner = authority.get("zip_state", {}).get(to_zip)
        if owner is not None and owner != to_state:
            return "to_zip is not a valid postal code for to_state"
    return None


def taxes_request(settings: dict[str, Any], customer: dict[str, Any], items: list[dict[str, Any]]) -> dict[str, Any]:
    address = customer.get("address") or {}
    return {
        "from_country": settings.get("country"),
        "from_zip": settings.get("postalCode"),
        "from_state": settings.get("state"),
        "from_city": settings.get("city"),
        "from_street": settings.get("addressLine1"),
        "to_country": address.get("countryCode"),
        "to_zip": address.get("postalCode"),
        "to_state": address.get("state"),
        "to_city": address.get("city"),
        "to_street": address.get("streetLineOne"),
        "shipping": 0,
        "line_items": [
            {
                "quantity": line["quantity"],
                "product_tax_code": settings.get("taxCategory"),
                "unit_price": line["unitCost"],
            }
            for line in items
        ],
    }


def quoted_rate(authority: dict[str, Any], environment: str, body: dict[str, Any]) -> float:
    jurisdiction = rate_lookup(
        authority,
        environment,
        str(body.get("to_country") or ""),
        str(body.get("to_state") or ""),
        str(body.get("to_zip") or ""),
    )
    lines = body.get("line_items") or []
    taxable = 0.0
    subtotal = 0.0
    for line in lines:
        amount = float(line.get("quantity") or 0) * float(line.get("unit_price") or 0)
        code = str(line.get("product_tax_code") or "").strip()
        multiplier = authority["product_tax_codes"].get(code, 1.0) if code else 1.0
        taxable += amount * multiplier
        subtotal += amount
    base = float(jurisdiction.get("rate", 0.0))
    return base * (taxable / subtotal) if subtotal else base


EU_COUNTRY_CODES = [
    "AT", "BE", "BG", "CY", "CZ", "DK", "DE", "EE", "EL", "ES", "FI", "FR", "GR",
    "HR", "IT", "HU", "IE", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SI",
    "SK", "SE", "GB", "UK",
]


def is_european(country_code: str | None) -> bool:
    if not country_code:
        return False
    return country_code.upper() in EU_COUNTRY_CODES


def vat_line(country_code: str | None, vat_id: str | None) -> str:
    return f"VAT Registration Number: {vat_id}" if is_european(country_code) and vat_id else ""


def country_name(country_names: dict[str, str], code: str | None) -> str:
    """`CountryLookup[code]` — the lookup is keyed lower case and misses stringify."""
    if code in country_names:
        return country_names[code]
    return "undefined"


def expected_case(
    case: dict[str, Any], authority: dict[str, Any], country_names: dict[str, str]
) -> dict[str, Any]:
    """Everything a correct implementation must produce for one graded invoice."""
    settings = case["settings"]
    customer = case["customer"]
    items = case["items"]
    address = customer.get("address") or {}

    total_without_tax = subtotal_of(items)
    regime = settings.get("taxCalculationType") or ""
    exempt = customer.get("taxExempt") == "exempt"
    environment = environment_for(settings)
    api_key = settings.get("taxJarApiKey") or ""

    taxes_call: dict[str, Any] | None = None
    creation_fails = False
    absorbed_error = False
    rate = 0.0

    if exempt:
        rate = 0.0
    elif regime == "manual":
        rate = float(settings.get("taxRate") or 0)
    elif regime == "meteringcoCalculated":
        if not api_key:
            creation_fails = True
        else:
            body = taxes_request(settings, customer, items)
            taxes_call = {"environment": environment, "api_key": api_key, "body": body}
            problem = address_problem(authority, body)
            if problem is not None:
                rate = 0.0
                absorbed_error = True
            else:
                rate = quoted_rate(authority, environment, body)

    tax_amount = rate * total_without_tax

    business_address = (
        str(settings.get("addressLine1") or "")
        + ("\n" if settings.get("addressLine1") != "" else "")
        + str(settings.get("addressLine2") or "")
        + ("\n" if settings.get("addressLine2") != "" else "")
        + str(settings.get("city") or "")
        + (", " if settings.get("city") != "" else "")
        + str(settings.get("state") or "")
        + (" " if settings.get("state") != "" else "")
        + str(settings.get("postalCode") or "")
        + ("\n" if settings.get("postalCode") != "" else "")
        + (country_name(country_names, settings.get("country")) if settings.get("country") != "" else "")
        + ("\n" if settings.get("country") != "" else "")
        + vat_line(settings.get("country"), settings.get("vatId"))
    )
    customer_address = (
        str(address.get("streetLineOne") or "")
        + ("\n" if address.get("streetLineOne", "") != "" else "")
        + str(address.get("streetLineTwo") or "")
        + ("\n" if address.get("streetLineTwo", "") != "" else "")
        + str(address.get("city") or "")
        + (", " if address.get("city", "") != "" else "")
        + str(address.get("state") or "")
        + (" " if address.get("state", "") != "" else "")
        + str(address.get("postalCode") or "")
        + ("\n" if address.get("postalCode", "") != "" else "")
        + (country_name(country_names, address.get("countryCode")) if address.get("countryCode", "") != "" else "")
        + ("\n" if address.get("countryCode", "") != "" else "")
        + vat_line(address.get("countryCode"), customer.get("customerVatId"))
    )

    def suffixed(parts: list[str]) -> str:
        return "".join(part + "\n" if part else "" for part in parts)

    from_entity = suffixed([settings.get("businessName") or "", business_address])
    to_entity = suffixed(
        [customer.get("customerName") or "", customer.get("email") or "", customer_address]
    )

    registers = bool(address.get("state")) and bool(address.get("countryCode")) and bool(address.get("postalCode"))
    order: dict[str, Any] | None = None
    if case.get("settle") and not creation_fails and registers and api_key:
        street_two = address.get("streetLineTwo") or ""
        order = {
            "environment": environment,
            "api_key": api_key,
            "provider": "meteringco",
            "to_country": address.get("countryCode"),
            "to_zip": address.get("postalCode"),
            "to_state": address.get("state"),
            "to_city": address.get("city"),
            "to_street": (
                f"{address.get('streetLineOne')} {street_two}" if street_two else address.get("streetLineOne")
            ),
            "amount": total_without_tax,
            "shipping": 0.0,
            "sales_tax": tax_amount,
        }

    return {
        "creation_fails": creation_fails,
        "absorbed_error": absorbed_error,
        "totalAmountWithoutTax": total_without_tax,
        "salesTaxRate": rate,
        "taxAmount": tax_amount,
        "total": total_without_tax + tax_amount,
        "fromEntity": from_entity,
        "toEntity": to_entity,
        "taxes_call": taxes_call,
        "order": order,
    }


# --------------------------------------------------------------------------
# Scoring
# --------------------------------------------------------------------------


def close(actual: Any, expected: float) -> bool:
    if actual is None:
        return False
    try:
        value = float(actual)
    except (TypeError, ValueError):
        return False
    return abs(value - expected) <= TOLERANCE * max(1.0, abs(expected))


class Report:
    def __init__(self) -> None:
        self.failures: list[str] = []
        self.checks = 0

    def require(self, condition: bool, message: str) -> None:
        self.checks += 1
        if not condition:
            self.failures.append(message)


def grade(
    spec: dict[str, Any],
    authority: dict[str, Any],
    country_names: dict[str, str],
    observed: dict[str, Any],
    snapshot: dict[str, Any],
) -> Report:
    report = Report()

    if not isinstance(observed, dict) or "cases" not in observed:
        report.require(False, "driver produced no case records")
        return report

    cases = observed.get("cases") or {}
    log = (snapshot or {}).get("tax_authority") or {}
    calls = [call for call in (log.get("calls") or []) if call.get("resource") == "taxes"]
    orders = list(log.get("orders") or [])

    expected_calls = 0
    expected_orders = 0

    for case in spec["cases"]:
        label = case["label"]
        want = expected_case(case, authority, country_names)
        got = cases.get(label)
        if not isinstance(got, dict):
            report.require(False, f"{label}: no record produced")
            continue

        created = got.get("create") or {}
        if want["creation_fails"]:
            report.require(
                created.get("ok") is False and (created.get("error") or {}).get("status") == 400,
                f"{label}: issuing the invoice should have been refused as a bad request",
            )
            continue

        report.require(created.get("ok") is True, f"{label}: issuing the invoice failed: {created.get('error')}")
        record = got.get("record") or {}

        report.require(
            close(record.get("totalAmountWithoutTax"), want["totalAmountWithoutTax"]),
            f"{label}: net amount is {record.get('totalAmountWithoutTax')}, expected {want['totalAmountWithoutTax']}",
        )
        report.require(
            close(record.get("salesTaxRate"), want["salesTaxRate"]),
            f"{label}: stored rate is {record.get('salesTaxRate')}, expected {want['salesTaxRate']}",
        )
        report.require(
            close(record.get("taxAmount"), want["taxAmount"]),
            f"{label}: tax is {record.get('taxAmount')}, expected {want['taxAmount']}",
        )
        report.require(
            record.get("fromEntity") == want["fromEntity"],
            f"{label}: seller block is {record.get('fromEntity')!r}, expected {want['fromEntity']!r}",
        )
        report.require(
            record.get("toEntity") == want["toEntity"],
            f"{label}: customer block is {record.get('toEntity')!r}, expected {want['toEntity']!r}",
        )
        if want["absorbed_error"]:
            report.require(
                created.get("error") is not None,
                f"{label}: an address the authority rejects should be reported, not swallowed silently",
            )

        # --- what reached the authority ---
        want_call = want["taxes_call"]
        street = (case["customer"].get("address") or {}).get("streetLineOne")
        matching = [call for call in calls if (call.get("body") or {}).get("to_street") == street]
        if want_call is None:
            report.require(
                not matching,
                f"{label}: the authority should not have been consulted at all ({len(matching)} call(s) seen)",
            )
        else:
            expected_calls += 1
            report.require(len(matching) == 1, f"{label}: expected one rate lookup, saw {len(matching)}")
            if len(matching) == 1:
                call = matching[0]
                report.require(
                    call.get("environment") == want_call["environment"],
                    f"{label}: rate looked up against {call.get('environment')}, expected {want_call['environment']}",
                )
                report.require(
                    call.get("api_key") == want_call["api_key"],
                    f"{label}: rate looked up with the wrong account credential",
                )
                body = call.get("body") or {}
                for field, value in want_call["body"].items():
                    if field == "line_items":
                        continue
                    report.require(
                        body.get(field) == value,
                        f"{label}: {field} sent as {body.get(field)!r}, expected {value!r}",
                    )
                sent_lines = body.get("line_items") or []
                report.require(
                    len(sent_lines) == len(want_call["body"]["line_items"]),
                    f"{label}: sent {len(sent_lines)} priced lines, expected {len(want_call['body']['line_items'])}",
                )
                for sent, wanted in zip(sent_lines, want_call["body"]["line_items"]):
                    report.require(
                        close(sent.get("quantity"), float(wanted["quantity"]))
                        and close(sent.get("unit_price"), float(wanted["unit_price"])),
                        f"{label}: a priced line was sent as {sent!r}, expected {wanted!r}",
                    )
                    report.require(
                        (sent.get("product_tax_code") or "") == (wanted["product_tax_code"] or ""),
                        f"{label}: product tax code sent as {sent.get('product_tax_code')!r},"
                        f" expected {wanted['product_tax_code']!r}",
                    )

        # --- settlement ---
        if not case.get("settle"):
            continue
        settled = got.get("settled") or {}
        report.require(
            (got.get("settle") or {}).get("ok") is True,
            f"{label}: settling the invoice failed: {(got.get('settle') or {}).get('error')}",
        )
        report.require(
            settled.get("invoiceStatus") == "Paid",
            f"{label}: invoice status after settlement is {settled.get('invoiceStatus')!r}",
        )

        want_order = want["order"]
        want_street = want_order["to_street"] if want_order else street
        booked = [order for order in orders if (order.get("payload") or {}).get("to_street") == want_street]
        if want_order is None:
            report.require(
                not booked,
                f"{label}: no transaction should have been filed with the authority ({len(booked)} seen)",
            )
            continue

        expected_orders += 1
        report.require(len(booked) == 1, f"{label}: expected one filed transaction, saw {len(booked)}")
        if len(booked) != 1:
            continue
        order = booked[0]
        payload = order.get("payload") or {}
        report.require(
            order.get("environment") == want_order["environment"],
            f"{label}: transaction filed against {order.get('environment')}, expected {want_order['environment']}",
        )
        report.require(
            order.get("account") == authority["api_keys"].get(want_order["api_key"]),
            f"{label}: transaction filed with the wrong account credential",
        )
        report.require(
            payload.get("transaction_id") == created.get("invoiceId"),
            f"{label}: transaction filed as {payload.get('transaction_id')!r}, expected the invoice number",
        )
        report.require(
            payload.get("provider") == want_order["provider"],
            f"{label}: transaction provider is {payload.get('provider')!r}",
        )
        for field in ("to_country", "to_zip", "to_state", "to_city"):
            report.require(
                payload.get(field) == want_order[field],
                f"{label}: transaction {field} is {payload.get(field)!r}, expected {want_order[field]!r}",
            )
        report.require(
            close(payload.get("amount"), want_order["amount"]),
            f"{label}: transaction amount is {payload.get('amount')}, expected {want_order['amount']}",
        )
        report.require(
            close(payload.get("sales_tax"), want_order["sales_tax"]),
            f"{label}: transaction tax is {payload.get('sales_tax')}, expected {want_order['sales_tax']}",
        )

    report.require(
        len(calls) == expected_calls,
        f"the authority saw {len(calls)} rate lookups in total, expected {expected_calls}",
    )
    report.require(
        len(orders) == expected_orders,
        f"the authority holds {len(orders)} filed transactions, expected {expected_orders}",
    )
    return report


def write_reward(output_dir: str, reward: float, detail: str) -> None:
    os.makedirs(output_dir, exist_ok=True)
    with open(os.path.join(output_dir, "reward.json"), "w", encoding="utf-8") as handle:
        json.dump({"reward": reward, "score": reward}, handle)
        handle.write("\n")
    with open(os.path.join(output_dir, "report.json"), "w", encoding="utf-8") as handle:
        json.dump({"detail": detail}, handle, indent=2)
        handle.write("\n")
    with open(os.path.join(output_dir, "reward.txt"), "w", encoding="utf-8") as handle:
        handle.write(f"{reward}\n")
    print(f"reward={reward}")
    print(detail)


def load(path: str | None) -> Any:
    if not path or not os.path.exists(path):
        return None
    try:
        with open(path, encoding="utf-8") as handle:
            return json.load(handle)
    except (OSError, ValueError):
        return None


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--fail")
    parser.add_argument("--scenario")
    parser.add_argument("--spec")
    parser.add_argument("--observed")
    parser.add_argument("--snapshot")
    parser.add_argument("--countries")
    args = parser.parse_args()

    if args.fail:
        write_reward(args.output_dir, 0.0, f"harness failure: {args.fail}")
        return

    scenario = load(args.scenario)
    spec = load(args.spec)
    observed = load(args.observed)
    snapshot = load(args.snapshot)
    country_names = load(args.countries) or {}

    # Fail closed: anything missing or unparseable is a zero, never a crash.
    if not scenario or not spec:
        write_reward(args.output_dir, 0.0, "held-out material is missing or unreadable")
        return
    if observed is None:
        write_reward(args.output_dir, 0.0, "the driver produced no output")
        return
    if snapshot is None:
        write_reward(args.output_dir, 0.0, "the authority log could not be read")
        return
    if isinstance(observed, dict) and observed.get("fatal"):
        write_reward(args.output_dir, 0.0, f"the driver aborted: {str(observed['fatal'])[:400]}")
        return

    report = grade(spec, scenario["tax_authority"], country_names, observed, snapshot)
    if report.failures:
        detail = f"{len(report.failures)} of {report.checks} checks failed:\n" + "\n".join(
            f"  - {line}" for line in report.failures[:40]
        )
        write_reward(args.output_dir, 0.0, detail)
        return
    write_reward(args.output_dir, 1.0, f"all {report.checks} checks passed")


if __name__ == "__main__":
    main()
