#!/usr/bin/env python3
"""Validate the three-task public sample and its reviewer evidence."""

from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path
from urllib.parse import unquote


ROOT = Path(__file__).resolve().parent.parent
TASKS = (
    "02-entitlement-overage-lines",
    "07-multi-region-sweep",
    "14-iam-role-validation",
)
EXPECTED_HEADINGS = {
    "02-entitlement-overage-lines": "# Task 2 — entitlement overage lines",
    "07-multi-region-sweep": "# Task 7 — multi-region sweep",
    "14-iam-role-validation": "# Task 14 — IAM role validation",
}
EXPECTED_SOLVES = {
    ("02-entitlement-overage-lines", "Grok 4.6"): 0,
    ("02-entitlement-overage-lines", "Opus 5"): 8,
    ("07-multi-region-sweep", "Grok 4.6"): 6,
    ("07-multi-region-sweep", "Opus 5"): 8,
    ("14-iam-role-validation", "Grok 4.6"): 3,
    ("14-iam-role-validation", "Opus 5"): 8,
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
    if len(trials) != 48 or not all(trial["valid"] for trial in trials):
        raise SystemExit("expected exactly 48 valid trials")
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


def validate_bundle_manifest() -> None:
    path = ROOT / "sample-run" / "manifests" / "selected-review-bundles.json"
    manifest = json.loads(path.read_text())
    for task, bundle in manifest["bundles"].items():
        if task not in TASKS:
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
            "sample-run/review-bundle/07-multi-region-sweep" in path.as_posix()
            or "sample-run/review-bundle/14-iam-role-validation" in path.as_posix()
        ) and INFRA_ASSIGNMENT.search(text):
            raise SystemExit(
                f"execution-infrastructure ID in {path.relative_to(ROOT)}"
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
    if manifest["summary"] != {
        "trials": 6,
        "exceptions": 0,
        "oracle_all_reward_one": True,
        "nop_all_reward_zero": True,
    }:
        raise SystemExit("unexpected post-normalization control summary")
    for task in TASKS:
        record = manifest["tasks"].get(task)
        if record is None:
            raise SystemExit(f"missing post-normalization controls: {task}")
        if record["public_task_sha256"] != directory_sha256(ROOT / "tasks" / task):
            raise SystemExit(f"post-normalization control task hash mismatch: {task}")
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
    if summary["scored_valid_trials"] != 48:
        raise SystemExit("execution summary trial count mismatch")
    if summary["controls"] != {
        "oracle": {"count": 3, "all_reward_one": True},
        "nop": {"count": 3, "all_reward_zero": True},
    }:
        raise SystemExit("execution summary control mismatch")
    print(
        f"publication validation passed: tasks=3 trials=48 controls=6 "
        f"links={links} text_files={text_files}"
    )


if __name__ == "__main__":
    main()
