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
    "bedrock/global.anthropic.claude-opus-5": "Opus 5",
}
COHORT = json.loads((ROOT / "harness" / "cohort.json").read_text())
EVIDENCE_COHORT = "grok-4.6-and-opus-5-eight-rollouts-20260819"
EVIDENCE_CONTROLS = "xai-public-controls-20260819"
REVIEW_BUNDLE_TASKS = (
    "02-multi-region-sweep",
    "03-iam-role-validation",
    "04-tax-jurisdiction",
    "05-network-egress-metering",
    "06-api-token-metering",
    "07-api-keys-and-environments",
    "08-dimension-pricing-tiers",
    "09-s3-datastore-measurement",
    "10-customer-identity-migration",
    "11-customer-billing-schedule-migration",
)
REVIEW_MODELS = ("grok", "opus")
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


def recorded_review_model(task: str, bundle_model: str) -> str:
    if bundle_model == "grok":
        return "bedrock/converse/us.xai.grok-4.6"
    if task.startswith(("08-", "09-", "10-", "11-")):
        return "bedrock/global.anthropic.claude-opus-5"
    return "bedrock/us.anthropic.claude-opus-5"


def mini_swe_metrics(trajectory: Path) -> tuple[int | None, int | None, int | None, float | None]:
    payload = json.loads(trajectory.read_text())
    messages = payload.get("messages")
    if not isinstance(messages, list):
        return None, None, None, None
    usages = []
    costs = []
    for message in messages:
        extra = message.get("extra") if isinstance(message, dict) else None
        response = extra.get("response") if isinstance(extra, dict) else None
        usage = response.get("usage") if isinstance(response, dict) else None
        if isinstance(usage, dict):
            usages.append(usage)
        if isinstance(extra, dict) and isinstance(extra.get("cost"), (int, float)):
            costs.append(float(extra["cost"]))
    if not usages:
        return None, None, None, None
    input_tokens = sum(int(usage.get("prompt_tokens") or 0) for usage in usages)
    output_tokens = sum(int(usage.get("completion_tokens") or 0) for usage in usages)
    cache_tokens = sum(
        int(
            (usage.get("prompt_tokens_details") or {}).get("cached_tokens")
            or usage.get("cache_read_input_tokens")
            or 0
        )
        for usage in usages
    )
    model_stats = (payload.get("info") or {}).get("model_stats") or {}
    cost = model_stats.get("instance_cost")
    if not isinstance(cost, (int, float)) and costs:
        cost = sum(costs)
    return input_tokens, cache_tokens, output_tokens, cost


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
            for bundle_model in REVIEW_MODELS:
                model = recorded_review_model(task, bundle_model)
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
                    if task.startswith(("05-", "06-", "07-")):
                        metrics = mini_swe_metrics(trajectory)
                    else:
                        metrics = (None, None, None, None)
                    agent = result.get("agent") or {}
                    scaffold = None
                    if task.startswith(("08-", "09-", "10-", "11-")):
                        scaffold = f'{agent.get("name")}/{agent.get("version")}'
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
                            "input_tokens": metrics[0],
                            "cache_tokens": metrics[1],
                            "output_tokens": metrics[2],
                            "reported_cost_usd": metrics[3],
                            "trial_number": trial_number,
                            **(
                                {"agent_scaffold": scaffold}
                                if scaffold is not None
                                else {}
                            ),
                        }
                    )
    by_model: dict[tuple[str, str], list[dict]] = defaultdict(list)
    for trial in trials:
        by_model[(trial["task"], trial["model"])].append(trial)
    for model_trials in by_model.values():
        if all("trial_number" in trial for trial in model_trials):
            model_trials.sort(key=lambda item: item["trial_number"])
        else:
            model_trials.sort(key=lambda item: item["started_at"] or "")
            for trial_number, trial in enumerate(model_trials, start=1):
                trial["trial_number"] = trial_number
        for trial in model_trials:
            trial_number = trial["trial_number"]
            trial["trial_number"] = trial_number
            trial["trial_label"] = (
                f'{trial["model_label"]} Trial {trial_number}'
            )
            if raw_dir == ROOT / "sample-run" / "raw":
                stratum = stratum_for(
                    trial["task"], trial_number, trial["model_label"]
                )
                recorded_checksum = trial.get("recorded_runtime_task_checksum")
                if recorded_checksum != stratum["task_checksum"]:
                    raise SystemExit(
                        "recorded runtime checksum does not match declared "
                        f"stratum for {trial['task']} trial {trial_number}: "
                        f"{recorded_checksum} != {stratum['task_checksum']}"
                    )
                trial["environment"] = stratum["environment"]
                trial["runtime_stratum"] = stratum["name"]
                declared_scaffold = stratum.get("agent_scaffold")
                recorded_scaffold = trial.get("agent_scaffold")
                if (
                    declared_scaffold is not None
                    and recorded_scaffold not in (None, declared_scaffold)
                ):
                    raise SystemExit(
                        "recorded agent scaffold does not match declared "
                        f"stratum for {trial['task']} trial {trial_number}: "
                        f"{recorded_scaffold} != {declared_scaffold}"
                    )
                if declared_scaffold is not None:
                    trial["agent_scaffold"] = declared_scaffold
    def stable_index_order(item: dict) -> tuple:
        task_number = int(item["task"].split("-", 1)[0])
        model_number = 0 if item["model_label"] == "Grok 4.6" else 1
        if 5 <= task_number <= 7:
            return (5, model_number, task_number, item["trial_number"])
        return (task_number, 0, model_number, item["trial_number"])

    trials.sort(key=stable_index_order)
    return trials


def pass_at_k(n: int, c: int, k: int) -> float:
    """Unbiased pass@k estimate from n trials with c solves."""
    if c == 0:
        return 0.0
    if n - c < k:
        return 1.0
    return 1.0 - comb(n - c, k) / comb(n, k)


def matrix_group(trial: dict) -> str:
    if (
        trial["model_label"] == "Opus 5"
        and trial["task"].startswith(("08-", "09-", "10-", "11-"))
    ):
        return f"Opus 5 ({trial['agent_scaffold']})"
    return trial["model_label"]


def render_matrix(trials: list[dict]) -> str:
    cells: dict[tuple[str, str], list[dict]] = defaultdict(list)
    for trial in trials:
        if trial["valid"]:
            cells[(trial["task"], matrix_group(trial))].append(trial)
    lines = [
        START,
        "| Model | Task | Solves `c/n` | pass@1 | pass@3 | pass@8 |",
        "| --- | --- | ---: | ---: | ---: | ---: |",
    ]
    groups = (
        "Grok 4.6",
        "Opus 5",
        "Opus 5 (opencode/1.18.13)",
        "Opus 5 (mini-swe-agent/2.4.5)",
    )
    for group in groups:
        group_started = False
        for task in TASKS:
            valid = cells[(task, group)]
            if not valid:
                continue
            n = len(valid)
            c = sum(item["passed"] for item in valid)
            values = [
                f"{pass_at_k(n, c, k):.4f}" if k <= n else "n/a"
                for k in (1, 3, 8)
            ]
            model_label = group if not group_started else ""
            group_started = True
            lines.append(
                f"| {model_label} | "
                f"[{TASK_LABELS[task]}](tasks/{task}/instruction.md) | {c}/{n} | "
                + " | ".join(values)
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
            *[
                f"sample-run/review-bundle/{task}"
                for task in REVIEW_BUNDLE_TASKS
            ],
        ]
        summary["runtime_strata"] = {
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
        }
        summary["pooled_result_boundary"] = (
            "Task 4 pools descriptive eight-attempt counts across one Daytona "
            "stratum and one AWS Fargate stratum. Model comparisons remain "
            "matched within each four-attempt stratum. Tasks 8 to 11 retain "
            "descriptive pooled Opus solve counts, but pass@k is reported "
            "separately for their four-attempt opencode and mini-SWE-agent "
            "strata."
        )
        summary["model_arms"] = {
            task: ["Grok 4.6", "Opus 5"] for task in TASKS
        }
        summary["build_provenance_note"] = (
            "Tasks 5 to 7 were built once per model arm, so each arm carries "
            "its own recorded Harbor task checksum and its own stratum. The "
            "published task packages are byte-identical to the packages the "
            "Opus arm ran against; see build_equivalence in "
            "sample-run/manifests/frozen-cohort.json."
        )
        summary["agent_scaffold_note"] = (
            "Tasks 8 to 11 ran Opus 5 attempts 01 to 04 under opencode 1.18.13 "
            "and attempts 05 to 08 under mini-SWE-agent 2.4.5; their "
            "trajectories carry the schema each scaffold emits. The Grok 4.6 "
            "arm is mini-SWE-agent 2.4.5 throughout."
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
            valid_cells[(trial["task"], trial["model_label"])] += 1
    incomplete = {
        f"{task}/{model_label}": valid_cells[(task, model_label)]
        for task in TASKS
        for model_label in ("Grok 4.6", "Opus 5")
        if valid_cells[(task, model_label)] != TARGET_ATTEMPTS
    }
    if incomplete:
        raise SystemExit(
            f"expected exactly {TARGET_ATTEMPTS} valid trials per cell: {incomplete}"
        )
    index_dir = ROOT / "sample-run" / "indexes"
    index_dir.mkdir(parents=True, exist_ok=True)
    (index_dir / "trials.json").write_text(
        json.dumps(trials, indent=1) + "\n"
    )
    (index_dir / "execution-summary.json").write_text(
        json.dumps(execution_summary(trials, raw_dir), indent=1) + "\n"
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
