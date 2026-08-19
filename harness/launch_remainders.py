#!/usr/bin/env python3
"""Run only the attempts still needed for eight valid trials per cell.

This launcher counts the consolidated canonical cohort, writes one single-cell
Harbor config per incomplete cell, and stores any new remainder jobs inside the
same canonical raw directory. It runs up to sixteen jobs at once. Each job uses
at most two agent slots, for an aggregate ceiling of 32 concurrent Daytona
agent phases.
"""

from __future__ import annotations

import json
import os
import subprocess
import argparse
from collections import Counter
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "sample-run" / "raw"
CONFIG_ROOT = ROOT / "sample-run" / "manifests" / "remainder-configs"
COHORT = json.loads((ROOT / "harness" / "cohort.json").read_text())
CANONICAL_RAW = RAW / COHORT["job_name"]
TARGET = int(COHORT["n_attempts"])
MAX_JOBS = 16
SLOTS_PER_JOB = 2

TASKS = [Path(entry["path"]).name for entry in COHORT["tasks"]]

MODELS = {
    "grok": {
        "import_path": "harness.harbor_agents:BedrockMiniSweAgent",
        "model_name": "bedrock/converse/us.xai.grok-4.6",
        "kwargs": {
            "version": "2.4.5",
            "cost_limit": "0",
            "config_file": "harness/mini-swe-bedrock-grok.yaml",
            "model_registry_file": "harness/litellm-bedrock-grok-4.6.json",
        },
        "env": {
            "BEDROCK_PROVIDER_AWS_ACCESS_KEY_ID": "${AWS_ACCESS_KEY_ID}",
            "BEDROCK_PROVIDER_AWS_SECRET_ACCESS_KEY": "${AWS_SECRET_ACCESS_KEY}",
            "BEDROCK_PROVIDER_AWS_SESSION_TOKEN": "${AWS_SESSION_TOKEN:-}",
            "BEDROCK_PROVIDER_AWS_REGION": "${AWS_REGION:-us-east-1}",
        },
    },
    "opus": {
        "import_path": "harness.harbor_agents:BedrockMiniSweAgent",
        "model_name": "bedrock/us.anthropic.claude-opus-5",
        "kwargs": {
            "version": "2.4.5",
            "cost_limit": "0",
            "config_file": "harness/mini-swe-bedrock.yaml",
        },
        "env": {
            "BEDROCK_PROVIDER_AWS_ACCESS_KEY_ID": "${AWS_ACCESS_KEY_ID}",
            "BEDROCK_PROVIDER_AWS_SECRET_ACCESS_KEY": "${AWS_SECRET_ACCESS_KEY}",
            "BEDROCK_PROVIDER_AWS_SESSION_TOKEN": "${AWS_SESSION_TOKEN:-}",
            "BEDROCK_PROVIDER_AWS_REGION": "${AWS_REGION:-us-east-1}",
        },
    },
}


def valid_counts() -> Counter[tuple[str, str]]:
    counts: Counter[tuple[str, str]] = Counter()
    result_paths = sorted(CANONICAL_RAW.glob("**/result.json"))
    for result_path in result_paths:
        if result_path.parent == result_path.parents[1]:
            continue
        try:
            result = json.loads(result_path.read_text())
        except (OSError, json.JSONDecodeError):
            continue
        config = result.get("config") or {}
        historical_task = Path(
            str((config.get("task") or {}).get("path") or "")
        ).name
        task = historical_task
        model = (config.get("agent") or {}).get("model_name")
        reward = ((result.get("verifier_result") or {}).get("rewards") or {}).get(
            "reward"
        )
        trajectory = next(
            (
                path
                for path in (
                    result_path.parent / "agent" / "trajectory.json",
                    result_path.parent
                    / "agent"
                    / "mini-swe-agent.trajectory.json",
                )
                if path.is_file()
            ),
            None,
        )
        verifier = next(
            (
                path
                for path in (
                    result_path.parent / "verifier" / "reward.json",
                    result_path.parent / "verifier" / "output.json",
                )
                if path.is_file()
            ),
            None,
        )
        if (
            task in TASKS
            and model in {entry["model_name"] for entry in MODELS.values()}
            and result.get("exception_info") is None
            and isinstance(reward, (int, float))
            and trajectory is not None
            and verifier is not None
        ):
            counts[(task, model)] += 1
    return counts


def make_config(task: str, model_key: str, missing: int, stamp: str) -> Path:
    model = dict(MODELS[model_key])
    slots = min(SLOTS_PER_JOB, missing)
    model["n_concurrent"] = slots
    task_number = task.split("-", 1)[0]
    job_name = f"mini-swe-remainder-{stamp}-{model_key}-{task_number}"
    config = {
        "job_name": job_name,
        "jobs_dir": f"sample-run/raw/{COHORT['job_name']}",
        "n_attempts": missing,
        "n_concurrent_trials": slots,
        "quiet": False,
        "retry": {
            "max_retries": 2,
            "exclude_exceptions": [
                "AgentTimeoutError",
                "VerifierTimeoutError",
                "RewardFileNotFoundError",
                "RewardFileEmptyError",
                "VerifierOutputParseError",
                "ApiUsageLimitError",
            ],
            "wait_multiplier": 1.0,
            "min_wait_sec": 2.0,
            "max_wait_sec": 60.0,
        },
        "environment": {
            "type": "daytona",
            "override_storage_mb": 10240,
            "kwargs": {
                "connection_pool_maxsize": 64,
                "labels": {"cohort": COHORT["job_name"]},
            },
        },
        "agents": [model],
        "tasks": [{"path": f"tasks/{task}"}],
    }
    path = CONFIG_ROOT / stamp / f"{model_key}-{task}.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(config, indent=2) + "\n")
    return path


def run_config(path: Path) -> tuple[str, int]:
    log_dir = ROOT / "sample-run" / "logs" / "remainder-launcher"
    log_dir.mkdir(parents=True, exist_ok=True)
    log_path = log_dir / f"{path.stem}.stdout.log"
    env = os.environ.copy()
    existing_pythonpath = env.get("PYTHONPATH")
    env["PYTHONPATH"] = (
        f"{ROOT}{os.pathsep}{existing_pythonpath}" if existing_pythonpath else str(ROOT)
    )
    with log_path.open("w") as log:
        completed = subprocess.run(
            ["harbor", "run", "--config", str(path), "--yes"],
            cwd=ROOT,
            env=env,
            stdout=log,
            stderr=subprocess.STDOUT,
        )
    return path.stem, completed.returncode


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--model",
        choices=["all", *MODELS],
        default="all",
        help="Select the model route.",
    )
    args = parser.parse_args()
    counts = valid_counts()
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    configs = []
    for task in TASKS:
        for model_key, model in MODELS.items():
            if args.model != "all" and model_key != args.model:
                continue
            complete = counts[(task, model["model_name"])]
            missing = max(0, TARGET - complete)
            if missing:
                configs.append(make_config(task, model_key, missing, stamp))
                print(
                    f"scheduled cell={task}/{model_key} complete={complete} missing={missing}"
                )

    print(
        f"launching jobs={len(configs)} max_parallel_jobs={MAX_JOBS} "
        f"slots_per_job={SLOTS_PER_JOB} aggregate_agent_cap={MAX_JOBS * SLOTS_PER_JOB}"
    )
    failures = []
    with ThreadPoolExecutor(max_workers=MAX_JOBS) as executor:
        futures = [executor.submit(run_config, path) for path in configs]
        for future in as_completed(futures):
            name, code = future.result()
            print(f"finished job={name} exit_code={code}", flush=True)
            if code:
                failures.append((name, code))
    if failures:
        raise SystemExit(f"remainder jobs failed: {failures}")


if __name__ == "__main__":
    main()
