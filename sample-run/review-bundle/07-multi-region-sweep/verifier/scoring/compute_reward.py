#!/usr/bin/env python3
"""Trusted scorer. Runs as root, loads no submitted code.

It re-derives the coverage a sweep of the held-out estate should have produced
straight from the scenario document -- which regions the account is switched
on in, which of those refuse the read being made, and which resources carry the
dimension being swept -- then compares that against what the submission
actually returned when the driver asked it for a sweep. The submission never
sees this file, the scenario, or the derived answers.

Reward is binary: every check passes, or the run is worth nothing.
"""

# TEST_CASE_COVERAGE_START
# CASE provisioned-volumes: discovers enabled regions and returns each readable region's volume inventory.
# CASE retained-snapshots: covers snapshot inventory with empty, throttled, and permanently unreadable regions.
# TEST_CASE_COVERAGE_END

from __future__ import annotations

import argparse
import json
import os

DIMENSION_TAG = "meteringcoDimensionId"

RESOURCE_KINDS = {
    "volumes": {"collection": "volumes", "identifier": "volume_id", "action": "DescribeVolumes"},
    "snapshots": {"collection": "snapshots", "identifier": "snapshot_id", "action": "DescribeSnapshots"},
}


# ---------------------------------------------------------------------------
# reference model
# ---------------------------------------------------------------------------


def swept_account(scenario: dict, role_arn: str) -> dict:
    """The account the run's role lives in."""
    account_id = role_arn.split(":")[4]
    for account in scenario.get("accounts", []):
        if str(account.get("account_id")) == account_id:
            return account
    return {}


def region_status(scenario: dict, action: str) -> tuple[list[str], set[str]]:
    """`(regions readable for this action, regions that refuse it)`.

    A region the account never switched on is neither: nothing about it is this
    business' concern. A region carrying a fault with a call budget recovers on
    its own once the budget runs out, so it is readable.
    """
    readable: list[str] = []
    refused: set[str] = set()
    for entry in scenario.get("regions", []):
        if entry.get("opt_in_status") == "not-opted-in":
            continue
        fault = (entry.get("faults") or {}).get(action)
        if fault is not None and fault.get("count") is None:
            refused.add(entry["name"])
            continue
        readable.append(entry["name"])
    return readable, refused


def expected_run(scenario: dict, run: dict) -> dict[str, list[str]]:
    kind = RESOURCE_KINDS[run["kind"]]
    account = swept_account(scenario, run["roleArn"])
    readable, _ = region_status(scenario, kind["action"])

    coverage: dict[str, list[str]] = {name: [] for name in readable}
    for record in account.get(kind["collection"], []):
        if record.get("region") not in coverage:
            continue
        if (record.get("tags") or {}).get(DIMENSION_TAG) != run["dimensionId"]:
            continue
        coverage[record["region"]].append(record[kind["identifier"]])
    return {name: sorted(ids) for name, ids in coverage.items()}


# ---------------------------------------------------------------------------
# comparison
# ---------------------------------------------------------------------------


def grade(scenario: dict, spec: dict, observed: dict) -> tuple[bool, list[str]]:
    failures: list[str] = []
    if observed.get("fatal"):
        failures.append(f"driver aborted before producing any sweep: {observed['fatal'][:400]}")
        return False, failures

    runs = observed.get("runs") or {}
    for run in spec["runs"]:
        label = run["label"]
        actual = runs.get(label)
        if actual is None:
            failures.append(f"{label}: no result recorded")
            continue
        if not actual.get("ok"):
            failures.append(f"{label}: sweep failed ({actual.get('error')})")
            continue

        regions = actual.get("regions")
        if not isinstance(regions, dict):
            failures.append(f"{label}: the sweep produced no per-region result")
            continue

        expected = expected_run(scenario, run)

        missing = sorted(set(expected) - set(regions))
        extra = sorted(set(regions) - set(expected))
        if missing:
            failures.append(f"{label}: regions absent from the sweep {missing}")
        if extra:
            failures.append(f"{label}: regions that should not have been reported {extra}")

        for name in sorted(set(expected) & set(regions)):
            want = expected[name]
            found = regions[name]
            if not isinstance(found, list):
                failures.append(f"{label}: {name} did not report a list")
                continue
            got = sorted(str(value) for value in found)
            if got != want:
                failures.append(f"{label}: {name} reported {got}, expected {want}")

    return not failures, failures


# ---------------------------------------------------------------------------


def emit(output_dir: str, reward: float, failures: list[str], note: str = "") -> None:
    os.makedirs(output_dir, exist_ok=True)
    payload = {"reward": reward, "score": reward}
    with open(os.path.join(output_dir, "reward.json"), "w", encoding="utf-8") as handle:
        json.dump(payload, handle)
        handle.write("\n")
    with open(os.path.join(output_dir, "reward.txt"), "w", encoding="utf-8") as handle:
        handle.write(f"{reward}\n")
    with open(os.path.join(output_dir, "report.txt"), "w", encoding="utf-8") as handle:
        if note:
            handle.write(f"{note}\n")
        for line in failures:
            handle.write(f"{line}\n")
        handle.write(f"reward={reward}\n")
    print(f"reward={reward}")
    for line in failures[:40]:
        print(f"  - {line}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--fail")
    parser.add_argument("--scenario")
    parser.add_argument("--spec")
    parser.add_argument("--observed")
    args = parser.parse_args()

    if args.fail:
        emit(args.output_dir, 0.0, [args.fail], note="harness precondition not met")
        return

    for label, path in (("scenario", args.scenario), ("spec", args.spec), ("observed", args.observed)):
        if not path or not os.path.exists(path):
            emit(args.output_dir, 0.0, [f"{label} file is missing"], note="nothing to score")
            return

    with open(args.scenario, encoding="utf-8") as handle:
        scenario = json.load(handle)
    with open(args.spec, encoding="utf-8") as handle:
        spec = json.load(handle)
    try:
        with open(args.observed, encoding="utf-8") as handle:
            observed = json.load(handle)
    except json.JSONDecodeError:
        emit(args.output_dir, 0.0, ["the driver produced no readable output"], note="nothing to score")
        return

    passed, failures = grade(scenario, spec, observed)
    emit(args.output_dir, 1.0 if passed else 0.0, failures)


if __name__ == "__main__":
    main()
