#!/usr/bin/env python3
"""Record an exact all-task oracle/no-op publication control run."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
TASKS = (
    "02-entitlement-overage-lines",
    "07-multi-region-sweep",
    "14-iam-role-validation",
    "27-tax-jurisdiction",
    "31-customer-onboarding",
)


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


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("job_dir", type=Path)
    args = parser.parse_args()
    job_dir = args.job_dir.resolve()

    records: dict[str, dict] = {}
    exceptions = 0
    started_dates = []
    for result_path in sorted(job_dir.glob("*/result.json")):
        result = json.loads(result_path.read_text())
        config = result.get("config") or {}
        task = Path(((config.get("task") or {}).get("path") or "")).name
        agent = (config.get("agent") or {}).get("name")
        if task not in TASKS or agent not in {"oracle", "nop"}:
            continue
        reward = ((result.get("verifier_result") or {}).get("rewards") or {}).get(
            "reward"
        )
        if reward is not None:
            reward = float(reward)
        exception = result.get("exception_info")
        exceptions += exception is not None
        if result.get("started_at"):
            started_dates.append(result["started_at"][:10])
        lock = json.loads((result_path.parent / "lock.json").read_text())
        digest = lock["task"]["digest"]
        task_record = records.setdefault(
            task,
            {
                "public_task_sha256": directory_sha256(ROOT / "tasks" / task),
                "harbor_task_digest": digest,
            },
        )
        if task_record["harbor_task_digest"] != digest:
            raise SystemExit(f"oracle/no-op task digest mismatch: {task}")
        if agent in task_record:
            raise SystemExit(f"duplicate control result: {task}/{agent}")
        task_record[agent] = {
            "trial_id": result.get("trial_name", "").rsplit("__", 1)[-1],
            "reward": reward,
            "exception": exception,
        }

    if set(records) != set(TASKS):
        raise SystemExit(f"control run task set mismatch: {sorted(records)}")
    for task, record in records.items():
        if record.get("oracle", {}).get("reward") != 1.0:
            raise SystemExit(f"oracle did not solve: {task}")
        if record.get("nop", {}).get("reward") != 0.0:
            raise SystemExit(f"no-op unexpectedly solved: {task}")
        if (
            record["oracle"]["exception"] is not None
            or record["nop"]["exception"] is not None
        ):
            raise SystemExit(f"control exception: {task}")

    payload = {
        "schema_version": 2,
        "run_date": min(started_dates) if started_dates else None,
        "purpose": (
            "post-normalization oracle and no-op validation of all runnable "
            "public tasks"
        ),
        "harbor_version": "0.18.0",
        "environment": "docker",
        "config": "harness/controls.json",
        "job_name": job_dir.name,
        "summary": {
            "trials": len(TASKS) * 2,
            "exceptions": exceptions,
            "oracle_all_reward_one": True,
            "nop_all_reward_zero": True,
        },
        "tasks": {task: records[task] for task in TASKS},
    }
    destination = (
        ROOT / "sample-run" / "manifests" / "public-controls-validation.json"
    )
    destination.write_text(json.dumps(payload, indent=2) + "\n")

    transformation_path = (
        ROOT / "sample-run" / "manifests" / "public-transformation.json"
    )
    transformation = json.loads(transformation_path.read_text())
    transformation["public_controls_reproduction_job"] = job_dir.name
    transformation["public_task_sha256"] = {
        task: records[task]["public_task_sha256"] for task in TASKS
    }
    transformation["recorded_runtime_controls"] = {
        "nop_required": 0.0,
        "oracle_required": 1.0,
        "tasks_passing": len(TASKS),
    }
    transformation_path.write_text(json.dumps(transformation, indent=2) + "\n")
    print(destination.relative_to(ROOT))


if __name__ == "__main__":
    main()
