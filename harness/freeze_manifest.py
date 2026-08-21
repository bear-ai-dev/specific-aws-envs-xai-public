#!/usr/bin/env python3
"""Record replay-affecting checksums without reading generated run artifacts."""

from __future__ import annotations

import hashlib
import json
import subprocess
from pathlib import Path

from cohort_provenance import RECORDED_RUNTIME_STRATA


ROOT = Path(__file__).resolve().parent.parent
CONFIG = json.loads((ROOT / "harness" / "cohort.json").read_text())


def directory_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    for item in sorted(candidate for candidate in path.rglob("*") if candidate.is_file()):
        if ".git" in item.parts or "__pycache__" in item.parts or item.name == ".DS_Store":
            continue
        digest.update(item.relative_to(path).as_posix().encode())
        digest.update(b"\0")
        digest.update(item.read_bytes())
        digest.update(b"\0")
    return digest.hexdigest()


def version(command: list[str]) -> str:
    return subprocess.check_output(command, text=True).strip()


def main() -> None:
    tasks = {}
    for entry in CONFIG["tasks"]:
        task_path = ROOT / entry["path"]
        tasks[task_path.name] = directory_sha256(task_path)
    task_labels = {
        task: f"Task {int(task.split('-', 1)[0])}" for task in tasks
    }

    payload = {
        "cohort": CONFIG["job_name"],
        "evidence_roots": [
            "sample-run/raw/grok-4.6-and-opus-5-eight-rollouts-20260819",
            "sample-run/review-bundle/07-multi-region-sweep",
            "sample-run/review-bundle/14-iam-role-validation",
            "sample-run/review-bundle/27-tax-jurisdiction",
            "sample-run/review-bundle/31-customer-onboarding",
        ],
        "evidence_controls": {
            "02-entitlement-overage-lines": (
                "sample-run/raw/xai-public-controls-20260819"
            ),
            "07-multi-region-sweep": (
                "sample-run/review-bundle/07-multi-region-sweep/controls"
            ),
            "14-iam-role-validation": (
                "sample-run/review-bundle/14-iam-role-validation/controls"
            ),
            "27-tax-jurisdiction": (
                "sample-run/review-bundle/27-tax-jurisdiction/controls"
            ),
            "31-customer-onboarding": (
                "sample-run/review-bundle/31-customer-onboarding/controls"
            ),
        },
        "publication_normalization": (
            "sample-run/manifests/public-transformation.json"
        ),
        "publication_controls_validation": (
            "sample-run/manifests/public-controls-validation.json"
        ),
        "recorded_runtime_strata": {
            task: [
                {
                    "name": stratum["name"],
                    "environment": stratum["environment"],
                    "trial_numbers": list(stratum["trial_numbers"]),
                    "task_checksum": stratum["task_checksum"],
                }
                for stratum in strata
            ]
            for task, strata in RECORDED_RUNTIME_STRATA.items()
        },
        "attempts_per_task_model": CONFIG["n_attempts"],
        "validity_rule": (
            "numeric verifier reward, complete trajectory, complete verifier "
            "artifact, no Harbor exception, and model matching within each "
            "recorded runtime-checksum stratum"
        ),
        "harbor_version": version(["harbor", "--version"]),
        "mini_swe_agent_version": "2.4.5",
        "models": {
            "grok-4.6": "bedrock/converse/us.xai.grok-4.6",
            "opus-5": "bedrock/us.anthropic.claude-opus-5",
        },
        "agent": "mini-swe-agent",
        "reasoning_effort": "high",
        "environments": ["daytona", "aws-fargate"],
        "pooled_result_boundary": (
            "Tasks 27 and 31 report pooled descriptive eight-attempt counts "
            "across a four-attempt Daytona stratum and a four-attempt AWS "
            "Fargate stratum. They are not represented as one frozen runtime "
            "configuration."
        ),
        "task_labels": task_labels,
        "public_task_sha256": tasks,
        "cohort_config_sha256": hashlib.sha256(
            (ROOT / "harness" / "cohort.json").read_bytes()
        ).hexdigest(),
        "controls_config_sha256": hashlib.sha256(
            (ROOT / "harness" / "controls.json").read_bytes()
        ).hexdigest(),
        "publication_controls_validation_sha256": hashlib.sha256(
            (
                ROOT
                / "sample-run"
                / "manifests"
                / "public-controls-validation.json"
            ).read_bytes()
        ).hexdigest(),
        "bedrock_config_sha256": hashlib.sha256(
            (ROOT / "harness" / "mini-swe-bedrock.yaml").read_bytes()
        ).hexdigest(),
        "grok_bedrock_config_sha256": hashlib.sha256(
            (ROOT / "harness" / "mini-swe-bedrock-grok.yaml").read_bytes()
        ).hexdigest(),
        "grok_model_registry_sha256": hashlib.sha256(
            (ROOT / "harness" / "litellm-bedrock-grok-4.6.json").read_bytes()
        ).hexdigest(),
        "adapter_sha256": hashlib.sha256(
            (ROOT / "harness" / "harbor_agents.py").read_bytes()
        ).hexdigest(),
    }
    destination = ROOT / "sample-run" / "manifests" / "frozen-cohort.json"
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n")
    print(destination.relative_to(ROOT))


if __name__ == "__main__":
    main()
