#!/usr/bin/env python3
"""Validate the public sample and its reviewer evidence."""

from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path
from urllib.parse import unquote

from cohort_provenance import RECORDED_RUNTIME_STRATA, stratum_for
from task_catalog import PUBLIC_TASKS


ROOT = Path(__file__).resolve().parent.parent
TASKS = PUBLIC_TASKS
BUNDLE_TASKS = (
    "02-multi-region-sweep",
    "03-iam-role-validation",
    "05-network-egress-metering",
    "06-api-token-metering",
    "07-api-keys-and-environments",
    "04-tax-jurisdiction",
    "08-dimension-pricing-tiers",
    "09-s3-datastore-measurement",
    "10-customer-identity-migration",
    "11-customer-billing-schedule-migration",
)
EXPECTED_HEADINGS = {
    "01-entitlement-overage-lines": "# Task 1 — entitlement overage lines",
    "02-multi-region-sweep": "# Task 2 — multi-region sweep",
    "03-iam-role-validation": "# Task 3 — IAM role validation",
    "04-tax-jurisdiction": "# Task 4 — tax jurisdiction",
    "05-network-egress-metering": "# Task 5 — network egress metering",
    "06-api-token-metering": "# Task 6 — API token metering",
    "07-api-keys-and-environments": "# Task 7 — API keys and environments",
    "08-dimension-pricing-tiers": "# Task 8 — dimension pricing tiers",
    "09-s3-datastore-measurement": "# Task 9 — S3 datastore measurement",
    "10-customer-identity-migration": "# Task 10 — customer identity migration",
    "11-customer-billing-schedule-migration": "# Task 11 — customer billing-schedule migration",
}
EXPECTED_SOLVES = {
    ("01-entitlement-overage-lines", "Grok 4.6"): 0,
    ("01-entitlement-overage-lines", "Opus 5"): 8,
    ("02-multi-region-sweep", "Grok 4.6"): 6,
    ("02-multi-region-sweep", "Opus 5"): 8,
    ("03-iam-role-validation", "Grok 4.6"): 3,
    ("03-iam-role-validation", "Opus 5"): 8,
    ("04-tax-jurisdiction", "Grok 4.6"): 0,
    ("04-tax-jurisdiction", "Opus 5"): 5,
    ("05-network-egress-metering", "Grok 4.6"): 3,
    ("05-network-egress-metering", "Opus 5"): 8,
    ("06-api-token-metering", "Grok 4.6"): 0,
    ("06-api-token-metering", "Opus 5"): 7,
    ("07-api-keys-and-environments", "Grok 4.6"): 5,
    ("07-api-keys-and-environments", "Opus 5"): 8,
    ("08-dimension-pricing-tiers", "Grok 4.6"): 2,
    ("08-dimension-pricing-tiers", "Opus 5"): 7,
    ("09-s3-datastore-measurement", "Grok 4.6"): 0,
    ("09-s3-datastore-measurement", "Opus 5"): 6,
    ("10-customer-identity-migration", "Grok 4.6"): 6,
    ("10-customer-identity-migration", "Opus 5"): 8,
    ("11-customer-billing-schedule-migration", "Grok 4.6"): 0,
    ("11-customer-billing-schedule-migration", "Opus 5"): 5,
}
LINK = re.compile(r"\[[^\]]+\]\(([^)]+)\)")
REAL_AWS_KEY = re.compile(r"\b(?:AKIA|ASIA)[0-9A-Z]{16}\b")
INFRA_ASSIGNMENT = re.compile(
    r"(?:DAYTONA_ORGANIZATION_ID|DAYTONA_SANDBOX_ID|"
    r"DAYTONA_SANDBOX_SNAPSHOT)=(?!<redacted>)[^\s\"']+"
)
LOCAL_HOME = re.compile(
    r"(?:/Users/[^/\s]+/Desktop/|/home/[^/\s]+/(?:Desktop|Documents|Projects)/)"
    r"[^\s\"']+"
)
NON_EXAMPLE_API_GATEWAY = re.compile(
    r"https://(?!example1234\.execute-api\.)"
    r"[a-z0-9-]+\.execute-api\.[a-z0-9-]+\.amazonaws\.com"
)
NON_EXAMPLE_AUTH0 = re.compile(
    r"https://(?!example-tenant\.(?:us\.)?auth0\.com)"
    r"[a-z0-9-]+\.(?:us\.)?auth0\.com"
)
HARBOR_DIGEST = re.compile(r"^sha256:[0-9a-f]{64}$")
HARBOR_TASK_CHECKSUM = re.compile(r"^[0-9a-f]{64}$")


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def directory_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    for item in sorted(candidate for candidate in path.rglob("*") if candidate.is_file()):
        if "__pycache__" in item.parts or item.name == ".DS_Store":
            continue
        digest.update(item.relative_to(path).as_posix().encode())
        digest.update(b"\0")
        digest.update(item.read_bytes())
        digest.update(b"\0")
    return digest.hexdigest()


def validate_links() -> int:
    checked = 0
    for markdown in sorted(ROOT.rglob("*.md")):
        if ".git" in markdown.parts:
            continue
        for target in LINK.findall(markdown.read_text()):
            target = target.strip().split(" ", 1)[0]
            if target.startswith(("http://", "https://", "mailto:", "#")):
                continue
            path_part = unquote(target.split("#", 1)[0])
            if not path_part:
                continue
            resolved = (markdown.parent / path_part).resolve()
            if not resolved.exists():
                raise SystemExit(
                    f"broken link in {markdown.relative_to(ROOT)}: {target}"
                )
            checked += 1
    return checked


def validate_trials() -> None:
    trials = json.loads((ROOT / "sample-run" / "indexes" / "trials.json").read_text())
    if len(trials) != 176 or not all(trial["valid"] for trial in trials):
        raise SystemExit("expected exactly 176 valid trials")
    for key, expected in EXPECTED_SOLVES.items():
        task, model = key
        cell = [
            trial
            for trial in trials
            if trial["task"] == task and trial["model_label"] == model
        ]
        if len(cell) != 8 or sum(trial["passed"] for trial in cell) != expected:
            raise SystemExit(f"unexpected trial cell {key}")
        for trial in cell:
            for field in ("trajectory", "verifier"):
                if not (ROOT / trial[field]).is_file():
                    raise SystemExit(f"missing {field}: {trial[field]}")
            stratum = stratum_for(task, trial["trial_number"], model)
            if trial.get("recorded_runtime_task_checksum") != stratum["task_checksum"]:
                raise SystemExit(
                    f"runtime checksum mismatch: {task}/{trial['trial_label']}"
                )
            if trial.get("environment") != stratum["environment"]:
                raise SystemExit(
                    f"runtime environment mismatch: {task}/{trial['trial_label']}"
                )
            if trial.get("runtime_stratum") != stratum["name"]:
                raise SystemExit(
                    f"runtime stratum mismatch: {task}/{trial['trial_label']}"
                )

    frozen = json.loads(
        (ROOT / "sample-run" / "manifests" / "frozen-cohort.json").read_text()
    )
    def serialize(stratum: dict) -> dict:
        record = {
            "name": stratum["name"],
            "environment": stratum["environment"],
            "trial_numbers": list(stratum["trial_numbers"]),
            "task_checksum": stratum["task_checksum"],
        }
        if "model_label" in stratum:
            record["model_label"] = stratum["model_label"]
        return record

    expected_strata = {
        task: [serialize(stratum) for stratum in strata]
        for task, strata in RECORDED_RUNTIME_STRATA.items()
    }
    if frozen.get("recorded_runtime_strata") != expected_strata:
        raise SystemExit("frozen cohort runtime strata mismatch")
    if frozen.get("environments") != ["daytona", "aws-fargate"]:
        raise SystemExit("frozen cohort environment declaration mismatch")
    if "not represented as one frozen runtime configuration" not in frozen.get(
        "pooled_result_boundary", ""
    ):
        raise SystemExit("missing pooled-result validity boundary")


def validate_bundle_manifest() -> None:
    path = ROOT / "sample-run" / "manifests" / "selected-review-bundles.json"
    manifest = json.loads(path.read_text())
    for task, bundle in manifest["bundles"].items():
        if task not in BUNDLE_TASKS:
            raise SystemExit(f"unexpected bundle task: {task}")
        expected_paths = set()
        for record in bundle["files"]:
            file_path = ROOT / record["path"]
            expected_paths.add(file_path.resolve())
            if not file_path.is_file() or sha256(file_path) != record["sha256"]:
                raise SystemExit(f"bundle hash mismatch: {record['path']}")
            if file_path.stat().st_size != record["size_bytes"]:
                raise SystemExit(f"bundle size mismatch: {record['path']}")
        bundle_root = ROOT / "sample-run" / "review-bundle" / task
        actual_paths = {
            item.resolve()
            for item in bundle_root.rglob("*")
            if item.is_file() and "__pycache__" not in item.parts
        }
        if actual_paths != expected_paths:
            raise SystemExit(f"bundle file set mismatch: {task}")
        if directory_sha256(bundle_root) != bundle["bundle_sha256"]:
            raise SystemExit(f"bundle directory hash mismatch: {task}")
        if directory_sha256(ROOT / "tasks" / task) != bundle["public_task_sha256"]:
            raise SystemExit(f"public task hash mismatch: {task}")


def validate_privacy_basics() -> int:
    checked = 0
    pattern_definitions = {
        ROOT / "harness" / "redact_artifacts.py",
        ROOT / "harness" / "validate_publication.py",
    }
    for path in sorted(ROOT.rglob("*")):
        if not path.is_file() or ".git" in path.parts:
            continue
        try:
            text = path.read_text()
        except UnicodeDecodeError:
            continue
        if REAL_AWS_KEY.search(text):
            raise SystemExit(f"AWS-key-shaped value in {path.relative_to(ROOT)}")
        if path not in pattern_definitions and LOCAL_HOME.search(text):
            raise SystemExit(f"local home path in {path.relative_to(ROOT)}")
        if (
            "/sample-run/review-bundle/" in path.as_posix()
            and any(task in path.as_posix() for task in BUNDLE_TASKS)
        ) and INFRA_ASSIGNMENT.search(text):
            raise SystemExit(
                f"execution-infrastructure ID in {path.relative_to(ROOT)}"
            )
        if NON_EXAMPLE_API_GATEWAY.search(text):
            raise SystemExit(
                f"non-example API Gateway identifier in {path.relative_to(ROOT)}"
            )
        if NON_EXAMPLE_AUTH0.search(text):
            raise SystemExit(
                f"non-example Auth0 tenant in {path.relative_to(ROOT)}"
            )
        checked += 1
    return checked


def validate_public_controls() -> None:
    manifest = json.loads(
        (
            ROOT
            / "sample-run"
            / "manifests"
            / "public-controls-validation.json"
        ).read_text()
    )
    for job_name, job in manifest["jobs"].items():
        if job["summary"]["exceptions"] != 0:
            raise SystemExit(f"control job {job_name} recorded an exception")
        if not job["summary"]["oracle_all_reward_one"]:
            raise SystemExit(f"control job {job_name} has a failing oracle")
        if not job["summary"]["nop_all_reward_zero"]:
            raise SystemExit(f"control job {job_name} has a passing no-op")
        if job.get("config") != "harness/controls.json":
            raise SystemExit(f"unexpected control config for {job_name}")
    for task, record in manifest["tasks"].items():
        if record["oracle"]["reward"] != 1.0 or record["nop"]["reward"] != 0.0:
            raise SystemExit(f"control rewards not 1.0/0.0 for {task}")
    if set(manifest["tasks"]) != set(TASKS):
        raise SystemExit("post-normalization controls must cover every task")
    for task in TASKS:
        record = manifest["tasks"].get(task)
        if record is None:
            raise SystemExit(f"missing post-normalization controls: {task}")
        if record["public_task_sha256"] != directory_sha256(
            ROOT / "tasks" / task
        ):
            raise SystemExit(f"post-normalization control task hash mismatch: {task}")
        digest = record.get("harbor_task_digest", "")
        checksum = record.get("harbor_task_checksum", "")
        if not (
            HARBOR_DIGEST.fullmatch(digest)
            or HARBOR_TASK_CHECKSUM.fullmatch(checksum)
        ):
            raise SystemExit(f"invalid Harbor task identifier: {task}")
        if record["oracle"] != {
            "trial_id": record["oracle"]["trial_id"],
            "reward": 1.0,
            "exception": None,
        }:
            raise SystemExit(f"invalid public oracle control: {task}")
        if record["nop"] != {
            "trial_id": record["nop"]["trial_id"],
            "reward": 0.0,
            "exception": None,
        }:
            raise SystemExit(f"invalid public no-op control: {task}")

    transformation = json.loads(
        (ROOT / "sample-run" / "manifests" / "public-transformation.json").read_text()
    )
    expected_hashes = {
        task: directory_sha256(ROOT / "tasks" / task) for task in TASKS
    }
    if transformation.get("public_task_sha256") != expected_hashes:
        raise SystemExit("public transformation task hashes are stale")


def main() -> None:
    for task in TASKS:
        first_line = (ROOT / "tasks" / task / "README.md").read_text().splitlines()[0]
        if first_line != EXPECTED_HEADINGS[task]:
            raise SystemExit(f"task heading mismatch: {task}")
    validate_trials()
    validate_bundle_manifest()
    validate_public_controls()
    links = validate_links()
    text_files = validate_privacy_basics()
    summary = json.loads(
        (ROOT / "sample-run" / "indexes" / "execution-summary.json").read_text()
    )
    trials_total = sum(
        1 for _ in json.loads((ROOT / "sample-run" / "indexes" / "trials.json").read_text())
    )
    if summary["scored_valid_trials"] != trials_total:
        raise SystemExit("execution summary trial count mismatch")
    controls = len(TASKS)
    if summary["controls"] != {
        "oracle": {"count": controls, "all_reward_one": True},
        "nop": {"count": controls, "all_reward_zero": True},
    }:
        raise SystemExit("execution summary control mismatch")
    print(
        f"publication validation passed: tasks={len(TASKS)} trials={trials_total} "
        f"controls={controls * 2} links={links} text_files={text_files}"
    )


if __name__ == "__main__":
    main()
