# Model trajectory review bundles

This directory contains the reviewer-facing code and evidence for all four
tasks in the sample. Each task has eight Grok 4.6 trajectories and eight paired
Opus 5 trajectories from a matched frozen cohort.

| Task | Grok | Opus | Review files |
| --- | ---: | ---: | --- |
| [Task 1: entitlement overage lines](../../tasks/01-entitlement-overage-lines/instruction.md) | 0/8 | 8/8 | [`01-entitlement-overage-lines/`](01-entitlement-overage-lines/) |
| [Task 2: multi-region sweep](../../tasks/02-multi-region-sweep/instruction.md) | 6/8 | 8/8 | [`02-multi-region-sweep/`](02-multi-region-sweep/) |
| [Task 3: IAM role validation](../../tasks/03-iam-role-validation/instruction.md) | 3/8 | 8/8 | [`03-iam-role-validation/`](03-iam-role-validation/) |
| [Task 4: tax jurisdiction](../../tasks/04-tax-jurisdiction/instruction.md) | 0/8 | 5/8 | [`04-tax-jurisdiction/`](04-tax-jurisdiction/) |

All four bundles use task-numbered subdirectories matching the report.

## Common artifact roles

| Folder | Contents |
| --- | --- |
| `touched-files/` | Every recoverable file Grok directly wrote, copied, reformatted, or deleted, separated by trial and original `/app` or `/tmp` path |
| `grok-solution/` | Each Grok trial's exact final changed files |
| `trajectories/grok/` | Eight native mini-SWE-agent Grok JSON trajectories |
| `trajectories/opus/` | Eight paired native mini-SWE-agent Opus JSON trajectories |
| `verifier/execution/` | The Harbor verifier entry point and execution driver |
| `verifier/scoring/` | Held-out data, run specification, and independent binary scorer |
| `verification-results/` | Per-trial report, observation, reward, verifier stdout, and compact Harbor result |
| `controls/` | Recorded-runtime oracle and no-op evidence for Tasks 2, 3, and 4; Task 1 controls remain in `sample-run/raw/xai-public-controls-20260819/` |

## Task 1 bundle

The Task 1 bundle contains 43 touched-file snapshots, including 20 files Grok
deleted before submission. The final submitted copies are in
[`01-entitlement-overage-lines/grok-solution/`](01-entitlement-overage-lines/grok-solution/),
and the complete verifier is split between
[`verifier/execution/`](01-entitlement-overage-lines/verifier/execution/) and
[`verifier/scoring/`](01-entitlement-overage-lines/verifier/scoring/).

For Grok Trial 1, both requested runs completed, but the scorer found five
missing zero-priced, zero-quantity invoice lines, producing reward `0.0`.

## Integrity

The runnable task directories are the source of truth for execution. Review
files are arranged by role for inspection. The
[`selected review-bundle manifest`](../manifests/selected-review-bundles.json)
records the published file hashes, trial counts, and control outcomes for Tasks
2, 3, and 4.
The separate
[`public control manifest`](../manifests/public-controls-validation.json)
records the post-normalization oracle/no-op rerun for Tasks 1, 2, 3, and 4.
