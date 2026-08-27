#!/usr/bin/env python3
"""Build the integrity manifest for the packaged review bundles."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

from cohort_provenance import RECORDED_RUNTIME_STRATA, stratum_for


ROOT = Path(__file__).resolve().parent.parent
DESTINATION = ROOT / "sample-run" / "manifests" / "selected-review-bundles.json"
TASKS = {
    "02-multi-region-sweep": {"grok": 6, "opus": 8},
    "03-iam-role-validation": {"grok": 3, "opus": 8},
    "04-tax-jurisdiction": {"grok": 0, "opus": 5},
    "05-network-egress-metering": {"grok": 3, "opus": 8},
    "06-api-token-metering": {"grok": 0, "opus": 7},
    "07-api-keys-and-environments": {"grok": 5, "opus": 8},
    "08-dimension-pricing-tiers": {"grok": 2, "opus": 7},
    "09-s3-datastore-measurement": {"grok": 0, "opus": 6},
    "10-customer-identity-migration": {"grok": 6, "opus": 8},
    "11-customer-billing-schedule-migration": {"grok": 0, "opus": 5},
}


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


def load_reward(path: Path) -> float:
    payload = json.loads(path.read_text())
    return float(payload["reward"])


def main() -> None:
    bundles = {}
    for task, expected in TASKS.items():
        bundle = ROOT / "sample-run" / "review-bundle" / task
        recorded_checksums = set()
        solves = {}
        stratum_solves = {
            stratum["name"]: {model: 0 for model in expected}
            for stratum in RECORDED_RUNTIME_STRATA[task]
        }
        for model in expected:
            rewards = []
            for number in range(1, 9):
                trial = bundle / "verification-results" / model / f"trial-{number:02d}"
                result = json.loads((trial / "harbor-result.json").read_text())
                checksum = result["taskChecksum"]
                stratum = stratum_for(task, number, "Grok 4.6" if model == "grok" else "Opus 5")
                if checksum != stratum["task_checksum"]:
                    raise SystemExit(
                        f"unexpected checksum for {task}/{model}/trial-{number:02d}: "
                        f"{checksum} != {stratum['task_checksum']}"
                    )
                recorded_checksums.add(checksum)
                reward = load_reward(trial / "reward.json")
                rewards.append(reward)
                stratum_solves[stratum["name"]][model] += reward == 1.0
                if result.get("exceptionInfo") is not None:
                    raise SystemExit(f"unexpected exception in {trial}")
            solves[model] = sum(reward == 1.0 for reward in rewards)
            if solves[model] != expected[model]:
                raise SystemExit(
                    f"unexpected solves for {task}/{model}: {solves[model]}"
                )
        declared_checksums = {
            stratum["task_checksum"]
            for stratum in RECORDED_RUNTIME_STRATA[task]
        }
        if recorded_checksums != declared_checksums:
            raise SystemExit(
                f"runtime strata mismatch for {task}: "
                f"{sorted(recorded_checksums)} != {sorted(declared_checksums)}"
            )
        controls = {
            agent: load_reward(bundle / "controls" / agent / "verifier" / "reward.json")
            for agent in ("oracle", "nop")
        }
        if controls != {"oracle": 1.0, "nop": 0.0}:
            raise SystemExit(f"invalid controls for {task}: {controls}")
        control_checksums = {
            agent: json.loads(
                (bundle / "controls" / agent / "harbor-result.json").read_text()
            )["taskChecksum"]
            for agent in ("oracle", "nop")
        }
        if len(set(control_checksums.values())) != 1:
            raise SystemExit(f"control checksum mismatch for {task}")

        files = []
        for item in sorted(candidate for candidate in bundle.rglob("*") if candidate.is_file()):
            if "__pycache__" in item.parts or item.name == ".DS_Store":
                continue
            files.append(
                {
                    "path": item.relative_to(ROOT).as_posix(),
                    "sha256": sha256(item),
                    "size_bytes": item.stat().st_size,
                }
            )
        bundles[task] = {
            "task_label": f"Task {int(task.split('-', 1)[0])}",
            "recorded_runtime_task_checksums": sorted(recorded_checksums),
            "runtime_strata": [
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
                    "solves": stratum_solves[stratum["name"]],
                }
                for stratum in RECORDED_RUNTIME_STRATA[task]
            ],
            "public_task_sha256": directory_sha256(ROOT / "tasks" / task),
            "solves": solves,
            "controls": controls,
            "recorded_control_task_checksums": control_checksums,
            "control_scope": (
                "The oracle/no-op result applies to the recorded Harbor checksum "
                "it names. public-controls-validation.json records the current "
                "publication tree hash for comparison; unless a job is marked "
                "post-normalization, that hash is not evidence of a rerun on the "
                "current tree."
            ),
            "counts": {
                "grok_trajectories": len(
                    list((bundle / "trajectories" / "grok").glob("trial-*.json"))
                ),
                "opus_trajectories": len(
                    list((bundle / "trajectories" / "opus").glob("trial-*.json"))
                ),
                "grok_verification_results": len(
                    list(
                        (bundle / "verification-results" / "grok").glob("trial-*")
                    )
                ),
                "opus_verification_results": len(
                    list(
                        (bundle / "verification-results" / "opus").glob("trial-*")
                    )
                ),
                "touched_file_snapshots": sum(
                    item.is_file() for item in (bundle / "touched-files").rglob("*")
                ),
                "published_files": len(files),
            },
            "bundle_sha256": directory_sha256(bundle),
            "files": files,
        }

    payload = {
        "schema_version": 1,
        "scope": "Tasks 2 through 11 publication review bundles",
        "bundles": bundles,
    }
    DESTINATION.parent.mkdir(parents=True, exist_ok=True)
    DESTINATION.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n")
    print(DESTINATION.relative_to(ROOT))


if __name__ == "__main__":
    main()
