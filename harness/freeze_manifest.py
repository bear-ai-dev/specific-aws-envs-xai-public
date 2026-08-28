#!/usr/bin/env python3
"""Record replay-affecting checksums without reading generated run artifacts."""

from __future__ import annotations

import hashlib
import json
import subprocess
from pathlib import Path

from cohort_provenance import RECORDED_RUNTIME_STRATA
from task_catalog import RECORDED_TASK_BY_PUBLIC


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
            *[
                f"sample-run/review-bundle/{task}"
                for task in RECORDED_TASK_BY_PUBLIC
            ],
        ],
        "evidence_controls": {
            "01-entitlement-overage-lines": (
                "sample-run/raw/xai-public-controls-20260819"
            ),
            **{
                task: f"sample-run/review-bundle/{task}/controls"
                for task in RECORDED_TASK_BY_PUBLIC
                if task != "01-entitlement-overage-lines"
            },
        },
        "recorded_task_ids": RECORDED_TASK_BY_PUBLIC,
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
                    **(
                        {"model_label": stratum["model_label"]}
                        if "model_label" in stratum
                        else {}
                    ),
                    **(
                        {"agent_scaffold": stratum["agent_scaffold"]}
                        if "agent_scaffold" in stratum
                        else {}
                    ),
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
            "opus-5-tasks-01-07": "bedrock/us.anthropic.claude-opus-5",
            "opus-5-tasks-08-11": "bedrock/global.anthropic.claude-opus-5",
        },
        "agent": "mixed; see recorded_runtime_strata",
        "agent_scaffolds": ["mini-swe-agent/2.4.5", "opencode/1.18.13"],
        "reasoning_effort": "high",
        "environments": ["daytona", "aws-fargate"],
        "pooled_result_boundary": (
            "Task 4 reports pooled descriptive eight-attempt counts across a "
            "four-attempt Daytona stratum and a four-attempt AWS Fargate "
            "stratum. It is not represented as one frozen runtime "
            "configuration. Tasks 8 to 11 report descriptive pooled Opus solve "
            "counts across four opencode and four mini-SWE-agent attempts, but "
            "their pass@k estimates remain separated by scaffold."
        ),
        "task_labels": task_labels,
        "public_task_sha256": tasks,
        "build_equivalence": {
            "scope": [
                "05-network-egress-metering",
                "06-api-token-metering",
                "07-api-keys-and-environments",
            ],
            "claim": (
                "Each of these tasks was built as two separate Harbor jobs, "
                "one per model arm, so the recorded task checksums differ "
                "between arms. The task package published in this repo is "
                "byte-identical to the package the Opus arm ran against in "
                "bear-ai-dev/specific-aws-envs-meta-public at commit d29ba9f, "
                "so the arms are comparable."
            ),
            "method": (
                "directory_sha256 over the published tasks/<task> tree, "
                "excluding __pycache__ and .DS_Store"
            ),
            "public_task_sha256": {
                task: tasks[task]
                for task in (
                    "05-network-egress-metering",
                    "06-api-token-metering",
                    "07-api-keys-and-environments",
                )
            },
            "verified_against": (
                "https://github.com/bear-ai-dev/"
                "specific-aws-envs-meta-public/tree/d29ba9f"
            ),
        },
        "cohort_config_sha256": hashlib.sha256(
            (ROOT / "harness" / "cohort.json").read_bytes()
        ).hexdigest(),
        "task_08_11_reproduction_config": (
            "harness/cohort-tasks-08-11-global-opus.json"
        ),
        "task_08_11_reproduction_config_sha256": hashlib.sha256(
            (
                ROOT
                / "harness"
                / "cohort-tasks-08-11-global-opus.json"
            ).read_bytes()
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
    destination.write_text(json.dumps(payload, indent=1, sort_keys=True) + "\n")
    print(destination.relative_to(ROOT))


if __name__ == "__main__":
    main()
