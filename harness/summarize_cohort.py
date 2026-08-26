#!/usr/bin/env python3
"""Index Harbor results and update the README pass-rate matrix."""

from __future__ import annotations

import argparse
import json
from collections import defaultdict
from math import comb
from pathlib import Path

from cohort_provenance import RECORDED_RUNTIME_STRATA, stratum_for
from task_catalog import TASK_LABELS, public_task_for, recorded_task_for


ROOT = Path(__file__).resolve().parent.parent
START = "<!-- MINI_SWE_MATRIX_START -->"
END = "<!-- MINI_SWE_MATRIX_END -->"
ALIASES = {
    "bedrock/converse/us.xai.grok-4.6": "Grok 4.6",
    "bedrock/us.anthropic.claude-opus-5": "Opus 5",
}
COHORT = json.loads((ROOT / "harness" / "cohort.json").read_text())
EVIDENCE_COHORT = "grok-4.6-and-opus-5-eight-rollouts-20260819"
EVIDENCE_CONTROLS = "xai-public-controls-20260819"
REVIEW_BUNDLE_TASKS = (
    "02-multi-region-sweep",
    "03-iam-role-validation",
    "04-tax-jurisdiction",
)
REVIEW_MODELS = {
    "grok": "bedrock/converse/us.xai.grok-4.6",
    "opus": "bedrock/us.anthropic.claude-opus-5",
}
TASKS = [Path(entry["path"]).name for entry in COHORT["tasks"]]
TARGET_ATTEMPTS = int(COHORT["n_attempts"])
REPRODUCTION_CONTROLS = json.loads(
    (ROOT / "harness" / "controls.json").read_text()
)["job_name"]


def first_existing(*paths: Path) -> Path | None:
    return next((path for path in paths if path.is_file()), None)


def display_path(path: Path) -> str:
    try:
        return path.relative_to(ROOT).as_posix()
    except ValueError:
        return path.as_posix()


def load_trials(raw_dir: Path) -> list[dict]:
    trials = []
    if raw_dir == ROOT / "sample-run" / "raw":
        result_paths = sorted(
            raw_dir.glob(f"{EVIDENCE_COHORT}/**/result.json")
        )
    else:
        result_paths = sorted(raw_dir.rglob("result.json"))
    for result_path in result_paths:
        try:
            result = json.loads(result_path.read_text())
        except (OSError, json.JSONDecodeError):
            continue
        trial_dir = result_path.parent
        config = result.get("config") or {}
        task_config = config.get("task") or {}
        agent_config = config.get("agent") or {}
        task_path = str(task_config.get("path") or "")
        historical_task = Path(task_path).name
        task = public_task_for(historical_task)
        model = agent_config.get("model_name")
        if task not in TASKS or model not in ALIASES:
            continue
        rewards = ((result.get("verifier_result") or {}).get("rewards") or {})
        reward = rewards.get("reward")
        trajectory = first_existing(
            trial_dir / "agent" / "trajectory.json",
            trial_dir / "agent" / "mini-swe-agent.trajectory.json",
        )
        verifier = first_existing(
            trial_dir / "verifier" / "output.json",
            trial_dir / "verifier" / "reward.json",
        )
        valid = (
            task in TASKS
            and model in ALIASES
            and result.get("exception_info") is None
            and isinstance(reward, (int, float))
            and trajectory is not None
            and verifier is not None
        )
        trials.append(
            {
                "task": task,
                "historical_task": historical_task,
                "task_label": TASK_LABELS[task],
                "model": model,
                "model_label": ALIASES.get(model, model),
                "recorded_trial_name": result.get("trial_name"),
                "started_at": result.get("started_at"),
                "reward": reward,
                "passed": bool(valid and float(reward) >= 1.0),
                "valid": valid,
                "trial_dir": display_path(trial_dir),
                "trajectory": (
                    display_path(trajectory) if trajectory else None
                ),
                "verifier": display_path(verifier) if verifier else None,
                "exception_info": result.get("exception_info"),
                "recorded_runtime_task_checksum": result.get("task_checksum"),
                "input_tokens": (result.get("agent_result") or {}).get(
                    "n_input_tokens"
                ),
                "cache_tokens": (result.get("agent_result") or {}).get(
                    "n_cache_tokens"
                ),
                "output_tokens": (result.get("agent_result") or {}).get(
                    "n_output_tokens"
                ),
                "reported_cost_usd": (result.get("agent_result") or {}).get(
                    "cost_usd"
                ),
            }
        )
    if raw_dir == ROOT / "sample-run" / "raw":
        for task in REVIEW_BUNDLE_TASKS:
            bundle = ROOT / "sample-run" / "review-bundle" / task
            for bundle_model, model in REVIEW_MODELS.items():
                for trial_number in range(1, TARGET_ATTEMPTS + 1):
                    label = f"trial-{trial_number:02d}"
                    trial_dir = (
                        bundle
                        / "verification-results"
                        / bundle_model
                        / label
                    )
                    result_path = trial_dir / "harbor-result.json"
                    trajectory = (
                        bundle
                        / "trajectories"
                        / bundle_model
                        / f"{label}.json"
                    )
                    verifier = trial_dir / "reward.json"
                    result = json.loads(result_path.read_text())
                    reward = (
                        (result.get("verifierResult") or {})
                        .get("rewards", {})
                        .get("reward")
                    )
                    valid = (
                        result.get("exceptionInfo") is None
                        and isinstance(reward, (int, float))
                        and trajectory.is_file()
                        and verifier.is_file()
                    )
                    trials.append(
                        {
                            "task": task,
                            "historical_task": recorded_task_for(task),
                            "task_label": TASK_LABELS[task],
                            "model": model,
                            "model_label": ALIASES[model],
                            "recorded_trial_name": result.get("trialName"),
                            "started_at": result.get("startedAt"),
                            "reward": reward,
                            "passed": bool(valid and float(reward) >= 1.0),
                            "valid": valid,
                            "trial_dir": display_path(trial_dir),
                            "trajectory": display_path(trajectory),
                            "verifier": display_path(verifier),
                            "exception_info": result.get("exceptionInfo"),
                            "recorded_runtime_task_checksum": result.get(
                                "taskChecksum"
                            ),
                            "input_tokens": None,
                            "cache_tokens": None,
                            "output_tokens": None,
                            "reported_cost_usd": None,
                        }
                    )
    by_model: dict[tuple[str, str], list[dict]] = defaultdict(list)
    for trial in trials:
        by_model[(trial["task"], trial["model"])].append(trial)
    for model_trials in by_model.values():
        model_trials.sort(key=lambda item: item["started_at"] or "")
        for trial_number, trial in enumerate(model_trials, start=1):
            trial["trial_number"] = trial_number
            trial["trial_label"] = (
                f'{trial["model_label"]} Trial {trial_number}'
            )
            if raw_dir == ROOT / "sample-run" / "raw":
                stratum = stratum_for(trial["task"], trial_number)
                recorded_checksum = trial.get("recorded_runtime_task_checksum")
                if recorded_checksum != stratum["task_checksum"]:
                    raise SystemExit(
                        "recorded runtime checksum does not match declared "
                        f"stratum for {trial['task']} trial {trial_number}: "
                        f"{recorded_checksum} != {stratum['task_checksum']}"
                    )
                trial["environment"] = stratum["environment"]
                trial["runtime_stratum"] = stratum["name"]
    trials.sort(
        key=lambda item: (
            item["task"], item["model_label"], item["trial_number"]
        )
    )
    return trials


def pass_at_k(n: int, c: int, k: int) -> float:
    """Unbiased pass@k estimate from n trials with c solves."""
    if c == 0:
        return 0.0
    if n - c < k:
        return 1.0
    return 1.0 - comb(n - c, k) / comb(n, k)


def render_matrix(trials: list[dict], models: tuple[str, ...] | None = None) -> str:
    models = models or tuple(ALIASES)
    cells: dict[tuple[str, str], list[dict]] = defaultdict(list)
    for trial in trials:
        if trial["valid"]:
            cells[(trial["task"], trial["model"])].append(trial)
    lines = [
        START,
        "| Model | Task | Solves `c/n` | pass@1 | pass@3 | pass@8 |",
        "| --- | --- | ---: | ---: | ---: | ---: |",
    ]
    for model in models:
        for task_index, task in enumerate(TASKS):
            valid = cells[(task, model)]
            n = len(valid)
            c = sum(item["passed"] for item in valid)
            values = [pass_at_k(n, c, k) for k in (1, 3, 8)]
            model_label = ALIASES[model] if task_index == 0 else ""
            lines.append(
                f"| {model_label} | "
                f"[{TASK_LABELS[task]}](tasks/{task}/instruction.md) | {c}/{n} | "
                + " | ".join(f"{value:.4f}" for value in values)
                + " |"
            )
    lines.append(END)
    return "\n".join(lines)


def execution_summary(trials: list[dict], raw_dir: Path) -> dict:
    packaged_raw = ROOT / "sample-run" / "raw"
    if raw_dir == packaged_raw:
        control_root = packaged_raw / EVIDENCE_CONTROLS
        cohort_directory = packaged_raw / EVIDENCE_COHORT
    else:
        control_root = raw_dir.parent / REPRODUCTION_CONTROLS
        cohort_directory = raw_dir
    controls = defaultdict(list)
    for result_path in sorted(control_root.glob("*/result.json")):
        result = json.loads(result_path.read_text())
        agent = ((result.get("config") or {}).get("agent") or {}).get("name")
        reward = ((result.get("verifier_result") or {}).get("rewards") or {}).get(
            "reward"
        )
        if agent in {"oracle", "nop"} and isinstance(reward, (int, float)):
            controls[agent].append(float(reward))

    if raw_dir == packaged_raw:
        for task in REVIEW_BUNDLE_TASKS:
            for agent in ("oracle", "nop"):
                result_path = (
                    ROOT
                    / "sample-run"
                    / "review-bundle"
                    / task
                    / "controls"
                    / agent
                    / "harbor-result.json"
                )
                result = json.loads(result_path.read_text())
                reward = (
                    (result.get("verifierResult") or {})
                    .get("rewards", {})
                    .get("reward")
                )
                if isinstance(reward, (int, float)):
                    controls[agent].append(float(reward))

    summary = {
        "cohort_directory": display_path(cohort_directory),
        "scored_valid_trials": sum(trial["valid"] for trial in trials),
        "completed_trials_excluded_from_denominator": sum(
            not trial["valid"] for trial in trials
        ),
        "controls": {
            "oracle": {
                "count": len(controls["oracle"]),
                "all_reward_one": bool(controls["oracle"])
                and all(value == 1 for value in controls["oracle"]),
            },
            "nop": {
                "count": len(controls["nop"]),
                "all_reward_zero": bool(controls["nop"])
                and all(value == 0 for value in controls["nop"]),
            },
        },
        "denominator_policy": (
            "numeric verifier reward, complete trajectory, complete verifier "
            "artifact, no Harbor exception, and matching model attempts within "
            "each recorded runtime-checksum stratum"
        ),
    }
    if raw_dir == packaged_raw:
        summary["evidence_roots"] = [
            display_path(cohort_directory),
            "sample-run/review-bundle/01-entitlement-overage-lines",
            "sample-run/review-bundle/02-multi-region-sweep",
            "sample-run/review-bundle/03-iam-role-validation",
            "sample-run/review-bundle/04-tax-jurisdiction",
        ]
        summary["runtime_strata"] = {
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
        }
        summary["pooled_result_boundary"] = (
            "Task 4 pools descriptive eight-attempt counts across one Daytona "
            "stratum and one AWS Fargate stratum. Model comparisons remain "
            "matched within each four-attempt stratum."
        )
    return summary


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--raw-dir",
        type=Path,
        default=ROOT / "sample-run" / "raw",
    )
    args = parser.parse_args()
    raw_dir = args.raw_dir.resolve()
    trials = load_trials(raw_dir)
    valid_cells: dict[tuple[str, str], int] = defaultdict(int)
    for trial in trials:
        if trial["valid"]:
            valid_cells[(trial["task"], trial["model"])] += 1
    incomplete = {
        f"{task}/{ALIASES[model]}": valid_cells[(task, model)]
        for task in TASKS
        for model in ALIASES
        if valid_cells[(task, model)] != TARGET_ATTEMPTS
    }
    if incomplete:
        raise SystemExit(
            f"expected exactly {TARGET_ATTEMPTS} valid trials per cell: {incomplete}"
        )
    index_dir = ROOT / "sample-run" / "indexes"
    index_dir.mkdir(parents=True, exist_ok=True)
    (index_dir / "trials.json").write_text(
        json.dumps(trials, indent=2) + "\n"
    )
    (index_dir / "execution-summary.json").write_text(
        json.dumps(execution_summary(trials, raw_dir), indent=2) + "\n"
    )

    matrix = render_matrix(trials)
    index_matrix = matrix.replace("](tasks/", "](../../tasks/")
    (index_dir / "pass-rate-matrix.md").write_text(index_matrix + "\n")
    readme_path = ROOT / "README.md"
    readme = readme_path.read_text()
    if START not in readme or END not in readme:
        raise SystemExit("README matrix markers are missing")
    prefix, rest = readme.split(START, 1)
    _, suffix = rest.split(END, 1)
    readme_path.write_text(prefix + matrix + suffix)
    print(
        f"indexed={len(trials)} valid={sum(t['valid'] for t in trials)}"
    )


if __name__ == "__main__":
    main()
