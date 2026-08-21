#!/usr/bin/env python3
"""Decide the reward for a customer onboarding submission.

Runs as root, loads no submitted code, and works out for itself what each
onboarding request should have produced from the request and the state it met.
The recorded observations are evidence about what the submission did; the rules
below are this file's own.

Reward is binary: every request must come out right.
"""
# TEST_CASE_COVERAGE_START
# CASE manual-no-offering: accept a manual customer without opening or enrolling a contract
# CASE caller-supplied-id-free: honor a caller identifier that is unused for this business
# CASE caller-supplied-id-taken: refuse an identifier already used by the business with no side effects
# CASE entitlement-reached: refuse onboarding beyond the customer cap and leave no state behind
# CASE stripe-without-connect: refuse a new card customer when the business has no connected payment account
# CASE stripe-on-connected-business: create and persist one rail customer and return its portal link
# CASE stripe-caller-brought-its-own-customer: reuse the supplied rail customer without creating another
# CASE offering-with-prepaid-credit: open, enroll, and persist the contract while applying its opening balance
# CASE offering-with-free-trial: persist the contract trial end and stamp the onboarding trial start
# CASE offering-without-free-trial: omit trial fields when the contract carries no trial
# CASE token-metering-unavailable: keep successful onboarding while recording the non-fatal metering error
# CASE address-metadata-and-tax: persist optional address, currency, VAT, tax, and announcement payload fields
# TEST_CASE_COVERAGE_END

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

UUID_V4 = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$", re.I)

CONFIG_BUCKET = "dev-config"
CONFIG_ORG = "meteringco"
MEASUREMENT = "CustomerConfig"
ENTITLEMENT_TYPE = "customers"
TOKEN_TYPE = "customer"
TOKEN_AMOUNT = "1"
WEBHOOK_TOPIC = "Standard"
WEBHOOK_TYPE = "CUSTOMER_CREATED"
AUDIT_ERROR_TOPIC = "ERROR"
STRIPE_CHANNEL = "Stripe"


# ---------------------------------------------------------------- line protocol


def _unescape(text: str) -> str:
    out = []
    index = 0
    while index < len(text):
        char = text[index]
        if char == "\\" and index + 1 < len(text):
            out.append(text[index + 1])
            index += 2
            continue
        out.append(char)
        index += 1
    return "".join(out)


def _split_unescaped(text: str, separator: str) -> list[str]:
    parts = []
    current = []
    index = 0
    while index < len(text):
        char = text[index]
        if char == "\\" and index + 1 < len(text):
            current.append(char)
            current.append(text[index + 1])
            index += 2
            continue
        if char == separator:
            parts.append("".join(current))
            current = []
            index += 1
            continue
        current.append(char)
        index += 1
    parts.append("".join(current))
    return parts


def parse_line_protocol(line: str) -> dict:
    """Split one influx line into measurement, tags and fields.

    Written out longhand rather than with a library because the verifier runs
    with nothing but the standard library available to it.
    """
    # Both separators have to be read carefully: a tag holding JSON escapes its
    # spaces and commas, while a string field quotes them instead.
    head, rest = _read_until_separator(line, 0, quoted=False)
    head_parts = _split_unescaped(head, ",")
    measurement = _unescape(head_parts[0])
    tags = {}
    for raw in head_parts[1:]:
        key, _, value = raw.partition("=")
        tags[_unescape(key)] = _unescape(value)

    field_blob, _ = _read_until_separator(line, rest, quoted=True)
    fields = {}
    for raw in _split_quoted(field_blob, ","):
        if not raw:
            continue
        key, _, value = raw.partition("=")
        value = value.strip()
        if len(value) >= 2 and value[0] == '"' and value[-1] == '"':
            value = _unescape(value[1:-1])
        fields[_unescape(key)] = value
    return {"measurement": measurement, "tags": tags, "fields": fields}


def _read_until_separator(text: str, start: int, quoted: bool) -> tuple[str, int]:
    """Return the run of `text` from `start` up to the next separating space.

    `quoted` decides whether a double-quoted stretch hides a space, which is how
    the field set carries a customer name and the tag set does not.
    """
    out = []
    index = start
    in_quote = False
    while index < len(text):
        char = text[index]
        if char == "\\" and index + 1 < len(text):
            out.append(char)
            out.append(text[index + 1])
            index += 2
            continue
        if quoted and char == '"':
            in_quote = not in_quote
        if char == " " and not in_quote:
            return "".join(out), index + 1
        out.append(char)
        index += 1
    return "".join(out), index


def _split_quoted(text: str, separator: str) -> list[str]:
    parts = []
    current = []
    index = 0
    in_quote = False
    while index < len(text):
        char = text[index]
        if char == "\\" and index + 1 < len(text):
            current.append(char)
            current.append(text[index + 1])
            index += 2
            continue
        if char == '"':
            in_quote = not in_quote
        if char == separator and not in_quote:
            parts.append("".join(current))
            current = []
            index += 1
            continue
        current.append(char)
        index += 1
    parts.append("".join(current))
    return parts


# ------------------------------------------------------------------ expectation


class Checker:
    def __init__(self, label: str):
        self.label = label
        self.failures: list[str] = []

    def check(self, condition: bool, note: str) -> bool:
        if not condition:
            self.failures.append(note)
        return bool(condition)

    def equal(self, actual, expected, note: str) -> bool:
        return self.check(actual == expected, f"{note}: expected {expected!r}, saw {actual!r}")


def between(value: str, low: str, high: str) -> bool:
    try:
        return low <= value <= high
    except TypeError:
        return False


def judge(run: dict, observed: dict) -> list[str]:
    """Return the reasons this request came out wrong; empty means right."""
    dto = run["dto"]
    settings = run["settings"]
    entitlement = run["entitlement"]
    contract = run.get("contract")
    business = dto.get("businessID")
    supplied_id = dto.get("customerId")
    existing = run["existingCustomerIds"]
    channel_options = dto.get("paymentChannelOptions") or {}
    supplied_stripe_id = channel_options.get("stripeCustomerId") or ""

    c = Checker(run["label"])

    if observed.get("fatal"):
        return [f"the request did not complete: {str(observed['fatal'])[:400]}"]

    writes = observed.get("influxWrites") or []
    hooks = observed.get("webhookEvents") or []
    tokens = observed.get("tokenCalls") or []
    contracts = observed.get("contractCreateCalls") or []
    enrolls = observed.get("enrollCalls") or []
    stripes = observed.get("stripeCustomerCalls") or []
    audits = observed.get("auditEvents") or []
    ents = observed.get("entitlementCalls") or []
    latest = observed.get("latestCustomerCalls") or []

    # ---- the allowance for the caller is consulted, for the right thing ----
    if c.equal(len(ents), 1, "the customer allowance was consulted once"):
        c.equal(ents[0].get("subject"), run["subject"], "allowance consulted for the calling user")
        c.equal(ents[0].get("entitlementType"), ENTITLEMENT_TYPE, "allowance consulted for customers")

    def expect_nothing_provisioned(reason: str):
        c.equal(writes, [], f"{reason}: nothing persisted")
        c.equal(hooks, [], f"{reason}: nothing published")
        c.equal(tokens, [], f"{reason}: nothing metered")
        c.equal(contracts, [], f"{reason}: no contract opened")
        c.equal(enrolls, [], f"{reason}: no enrollment")
        c.equal(stripes, [], f"{reason}: no payment-rail customer created")

    # ---- refusals -------------------------------------------------------
    if entitlement["entitlementExceeded"]:
        c.equal(observed.get("ok"), False, "an exhausted allowance is refused")
        status = (observed.get("error") or {}).get("status")
        c.equal(status, 409, "an exhausted allowance is a conflict")
        expect_nothing_provisioned("allowance exhausted")
        return c.failures

    if supplied_id:
        c.check(
            any(
                call.get("customerId") == supplied_id and call.get("businessID") == business
                for call in latest
            ),
            "a caller-supplied id is looked up on the business before use",
        )
    if supplied_id and supplied_id in existing:
        c.equal(observed.get("ok"), False, "a taken customer id is refused")
        status = (observed.get("error") or {}).get("status")
        c.equal(status, 400, "a taken customer id is a bad request")
        expect_nothing_provisioned("customer id already taken")
        return c.failures

    wants_new_stripe_customer = dto.get("paymentChannel") == STRIPE_CHANNEL and not supplied_stripe_id
    business_stripe_account = settings.get("stripeAccountId") or ""

    if wants_new_stripe_customer and not business_stripe_account:
        c.equal(observed.get("ok"), False, "billing a card with no connected account is refused")
        status = (observed.get("error") or {}).get("status")
        c.equal(status, 400, "an unconnected business is a bad request")
        expect_nothing_provisioned("business not connected to the payment rail")
        return c.failures

    # ---- the business settings are read on every accepted request -------
    c.check(
        any(call.get("businessID") == business for call in (observed.get("settingsCalls") or [])),
        "the business settings are read",
    )

    # ---- from here the request must succeed -----------------------------
    if not c.equal(observed.get("ok"), True, "the request succeeds"):
        c.failures.append(f"error raised instead: {json.dumps(observed.get('error'))}")
        return c.failures

    response = observed.get("response") or {}
    customer_id = response.get("customerId")
    c.check(isinstance(response.get("message"), str) and response["message"].strip() != "", "a message comes back")

    if supplied_id:
        c.equal(customer_id, supplied_id, "a free caller-supplied id is honoured")
    else:
        c.check(
            isinstance(customer_id, str) and bool(UUID_V4.match(customer_id)),
            f"an id is generated when none is supplied (saw {customer_id!r})",
        )

    # ---- the payment rail ----------------------------------------------
    if wants_new_stripe_customer:
        if c.equal(len(stripes), 1, "one payment-rail customer is created"):
            call = stripes[0]
            c.equal(call.get("customerName"), dto.get("customerName"), "created under the customer's name")
            c.equal(call.get("email"), dto.get("email"), "created against the customer's email")
            c.equal(
                call.get("businessStripeAccount"),
                business_stripe_account,
                "created on the business' connected account",
            )
            c.equal(
                call.get("accountState"),
                settings.get("accountState"),
                "created against the business' account state",
            )
        expected_stripe_id = run["stripe"]["stripeCustomerId"]
        c.equal(response.get("portalUrl"), run["stripe"]["portalUrl"], "the portal link comes back to the caller")
    else:
        c.equal(stripes, [], "no payment-rail customer is created")
        c.equal(response.get("portalUrl"), None, "no portal link is invented")
        expected_stripe_id = supplied_stripe_id or None

    # ---- the contract --------------------------------------------------
    if dto.get("offeringId"):
        if c.equal(len(contracts), 1, "one contract is opened"):
            call = contracts[0]
            c.equal(call.get("customerId"), customer_id, "the contract is opened for this customer")
            c.equal(call.get("offeringId"), dto["offeringId"], "the contract names the requested offering")
            c.equal(call.get("businessID"), business, "the contract belongs to the business")
            c.equal(
                call.get("settingsBusinessID"),
                settings.get("businessID"),
                "the contract is handed the business settings already read",
            )
            c.equal(
                call.get("usageOverrides"),
                dto.get("usage"),
                "usage supplied with the request is passed to the contract",
            )
        if c.equal(len(enrolls), 1, "the customer is enrolled in the contract"):
            call = enrolls[0]
            c.equal(call.get("subject"), run["subject"], "enrollment is attributed to the calling user")
            c.equal(call.get("customerId"), customer_id, "enrollment names this customer")
            c.equal(
                call.get("contractMessage"),
                (contract or {}).get("message"),
                "enrollment carries the contract that was opened",
            )
    else:
        c.equal(contracts, [], "no contract is opened without an offering")
        c.equal(enrolls, [], "no enrollment without an offering")

    # ---- the persisted customer ----------------------------------------
    if c.equal(len(writes), 1, "the customer is persisted once"):
        write = writes[0]
        c.equal(write.get("bucket"), CONFIG_BUCKET, "persisted to the configuration bucket for this stage")
        c.equal(write.get("org"), CONFIG_ORG, "persisted under the configured organisation")
        lines = write.get("lines") or []
        if c.equal(len(lines), 1, "one customer row is written"):
            row = parse_line_protocol(lines[0])
            tags = row["tags"]
            c.equal(row["measurement"], MEASUREMENT, "written as a customer configuration row")
            c.equal(tags.get("customerId"), customer_id, "the row carries the customer id")
            c.equal(tags.get("businessID"), business, "the row carries the business")
            c.equal(tags.get("paymentChannel"), dto.get("paymentChannel"), "the row carries the payment channel")
            c.equal(tags.get("email"), dto.get("email"), "the row carries the email")
            c.equal(tags.get("taxExempt"), dto.get("taxExempt", "none"), "the row carries the tax position")
            c.equal(row["fields"].get("customerName"), dto.get("customerName"), "the row carries the name")
            if dto.get("customerVatId"):
                c.equal(tags.get("customerVatId"), dto["customerVatId"], "the row carries the VAT id")
            if dto.get("address"):
                c.equal(
                    tags.get("address"),
                    json.dumps(dto["address"], separators=(",", ":")),
                    "the row carries the address",
                )
            if dto.get("currency"):
                c.equal(tags.get("currency"), dto["currency"], "the row carries the currency")

            if expected_stripe_id:
                c.equal(
                    tags.get("paymentChannelOptions_stripeCustomerId"),
                    expected_stripe_id,
                    "the row carries the payment-rail customer that will be billed",
                )
            else:
                c.check(
                    "paymentChannelOptions_stripeCustomerId" not in tags,
                    "no payment-rail customer is recorded when none exists",
                )

            if dto.get("offeringId"):
                c.equal(tags.get("offeringId"), dto["offeringId"], "the row carries the offering")
                c.equal(
                    tags.get("offeringEnrollmentDate"),
                    (contract or {}).get("offeringEnrollmentDate"),
                    "the row carries the enrollment date the contract settled on",
                )
            else:
                c.check("offeringId" not in tags, "no offering is recorded when none was requested")

            prepaid = (contract or {}).get("prepaidCredit")
            if prepaid:
                # Tags arrive as text whatever the contract returned, so the
                # comparison is on the value, not on how it was typed.
                c.equal(
                    tags.get("creditBalance"), str(prepaid), "prepaid credit from the contract opens the balance"
                )
            else:
                c.check("creditBalance" not in tags, "no balance is opened without prepaid credit")

            trial_end = ((contract or {}).get("overridesForOffering") or {}).get("freeTrialEndDate")
            if trial_end:
                c.equal(tags.get("freeTrialEndDate"), trial_end, "the free trial end from the contract is recorded")
                started = tags.get("freeTrialStartDate")
                c.check(
                    isinstance(started, str)
                    and between(started, observed.get("startedAt", ""), observed.get("finishedAt", "")),
                    f"the free trial starts when the customer is onboarded (saw {started!r})",
                )
            else:
                c.check("freeTrialEndDate" not in tags, "no free trial end without one on the contract")
                c.check("freeTrialStartDate" not in tags, "no free trial start without a free trial")

    # ---- metering ------------------------------------------------------
    if c.equal(len(tokens), 1, "the onboarding is metered once"):
        call = tokens[0]
        c.equal(call.get("subject"), run["subject"], "metered against the calling user")
        c.equal(call.get("businessID"), business, "metered against the business")
        c.equal(call.get("tokenAmount"), TOKEN_AMOUNT, "one unit is metered")
        c.equal((call.get("metadata") or {}).get("tokenType"), TOKEN_TYPE, "metered as a customer")

    error_audits = [event for event in audits if event.get("topic") == AUDIT_ERROR_TOPIC]
    if run["tokenMetering"] == "throw":
        if c.equal(len(error_audits), 1, "a metering failure is recorded"):
            data = error_audits[0].get("data") or [{}]
            first = data[0] if data else {}
            c.equal(first.get("customerId"), customer_id, "the metering failure names the customer")
            c.equal(first.get("businessID"), business, "the metering failure names the business")
            c.check(first.get("error") is not None, "the metering failure carries the cause")
    else:
        c.equal(error_audits, [], "no failure is recorded when metering works")

    # ---- the announcement ----------------------------------------------
    if c.equal(len(hooks), 1, "the new customer is announced once"):
        hook = hooks[0]
        c.equal(hook.get("topic"), WEBHOOK_TOPIC, "announced on the standard stream")
        c.equal(hook.get("type"), WEBHOOK_TYPE, "announced as a created customer")
        c.equal(hook.get("businessID"), business, "announced to the business")
        payload = hook.get("payload") or {}
        c.equal(payload.get("customerId"), customer_id, "the announcement names the customer")
        c.equal(payload.get("customerName"), dto.get("customerName"), "the announcement carries the name")
        prepaid = (contract or {}).get("prepaidCredit")
        if prepaid:
            c.equal(payload.get("creditBalance"), prepaid, "the announcement carries the opening balance")
        trial_end = ((contract or {}).get("overridesForOffering") or {}).get("freeTrialEndDate")
        if trial_end:
            c.equal(payload.get("freeTrialEndDate"), trial_end, "the announcement carries the free trial end")
        if expected_stripe_id:
            c.equal(
                (payload.get("paymentChannelOptions") or {}).get("stripeCustomerId"),
                expected_stripe_id,
                "the announcement carries the payment-rail customer",
            )

    return c.failures


# ------------------------------------------------------------------------ shell


def write_result(output_dir: Path, reward: int, summary: str, detail: dict) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "reward.json").write_text(
        json.dumps({"reward": reward, "score": reward}, indent=2) + "\n"
    )
    (output_dir / "report.json").write_text(
        json.dumps({"summary": summary, "detail": detail}, indent=2) + "\n"
    )
    (output_dir / "reward.txt").write_text(f"{reward}\n")
    print(f"reward {reward}: {summary}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--fail")
    parser.add_argument("--spec")
    parser.add_argument("--observed")
    parser.add_argument("--published")
    parser.add_argument("--snapshot")
    args = parser.parse_args()

    output_dir = Path(args.output_dir)

    if args.fail:
        write_result(output_dir, 0, args.fail, {})
        return 0

    try:
        spec = json.load(open(args.spec))
    except Exception as error:
        write_result(output_dir, 0, f"the graded requests could not be read: {error}", {})
        return 0

    try:
        observed = json.load(open(args.observed))
    except Exception as error:
        write_result(output_dir, 0, f"the submission produced no readable observations: {error}", {})
        return 0

    if observed.get("fatal"):
        write_result(
            output_dir, 0, "the submission could not be driven at all", {"fatal": str(observed["fatal"])[:2000]}
        )
        return 0

    runs = observed.get("runs") or {}

    # The copy the driver left in the object store the verifier owns is the one
    # that decides. A submission that reports one thing through the driver and
    # another through the store is not scored at all.
    published_dir = Path(args.published) if args.published else None
    published: dict[str, dict] = {}
    if published_dir and published_dir.is_dir():
        for path in published_dir.glob("*.json"):
            try:
                published[path.stem] = json.loads(path.read_text())
            except Exception:
                published[path.stem] = {"__unreadable__": True}

    detail: dict[str, object] = {}
    failures: dict[str, list[str]] = {}

    for run in spec["runs"]:
        label = run["label"]
        seen = runs.get(label)
        if seen is None:
            failures[label] = ["the request was never answered"]
            continue
        if published_dir is not None:
            mirror = published.get(label)
            if mirror is None:
                failures[label] = ["the request left no record in the object store"]
                continue
            if json.dumps(mirror, sort_keys=True) != json.dumps(seen, sort_keys=True):
                failures[label] = ["the two records of the request disagree"]
                continue
        reasons = judge(run, seen)
        if reasons:
            failures[label] = reasons

    detail["requests"] = len(spec["runs"])
    detail["wrong"] = failures
    detail["right"] = [run["label"] for run in spec["runs"] if run["label"] not in failures]

    if failures:
        first = next(iter(failures))
        summary = f"{len(failures)} of {len(spec['runs'])} requests wrong; first is {first}: {failures[first][0]}"
        write_result(output_dir, 0, summary, detail)
        return 0

    write_result(output_dir, 1, f"all {len(spec['runs'])} onboarding requests behaved correctly", detail)
    return 0


if __name__ == "__main__":
    sys.exit(main())
