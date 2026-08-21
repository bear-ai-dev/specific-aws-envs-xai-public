# Model trajectory review bundles

This directory contains the reviewer-facing code and evidence for all five
tasks in the sample. Each task has eight Grok 4.6 trajectories and eight paired
Opus 5 trajectories from a matched frozen cohort.

| Task | Grok | Opus | Review files |
| --- | ---: | ---: | --- |
| [Task 2: entitlement overage lines](../../tasks/02-entitlement-overage-lines/instruction.md) | 0/8 | 8/8 | The root-level folders in this directory |
| [Task 7: multi-region sweep](../../tasks/07-multi-region-sweep/instruction.md) | 6/8 | 8/8 | [`07-multi-region-sweep/`](07-multi-region-sweep/) |
| [Task 14: IAM role validation](../../tasks/14-iam-role-validation/instruction.md) | 3/8 | 8/8 | [`14-iam-role-validation/`](14-iam-role-validation/) |
| [Task 27: tax jurisdiction](../../tasks/27-tax-jurisdiction/instruction.md) | 0/8 | 5/8 | [`27-tax-jurisdiction/`](27-tax-jurisdiction/) |
| [Task 31: customer onboarding](../../tasks/31-customer-onboarding/instruction.md) | 0/8 | 5/8 | [`31-customer-onboarding/`](31-customer-onboarding/) |

Task 2 retains the existing root-level review path so previously shared links
continue to work. Tasks 7, 14, 27, and 31 use task-numbered subdirectories with
the same artifact roles.

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
| `controls/` | Recorded-runtime oracle and no-op evidence for Tasks 7, 14, 27, and 31; Task 2 controls remain in `sample-run/raw/xai-public-controls-20260819/` |

## Task 2 root-level bundle

The Task 2 bundle contains 43 touched-file snapshots, including 20 files Grok
deleted before submission. The final submitted copies are in
[`grok-solution/`](grok-solution/), and the complete verifier is split between
[`verifier/execution/`](verifier/execution/) and
[`verifier/scoring/`](verifier/scoring/).

For Grok Trial 1, both requested runs completed, but the scorer found five
missing zero-priced, zero-quantity invoice lines, producing reward `0.0`.

## Integrity

The runnable task directories are the source of truth for execution. Review
files are arranged by role for inspection. The
[`selected review-bundle manifest`](../manifests/selected-review-bundles.json)
records the published file hashes, trial counts, and control outcomes for Tasks
7, 14, 27, and 31.
The separate
[`public control manifest`](../manifests/public-controls-validation.json)
records the post-normalization oracle/no-op rerun for Tasks 2, 7, and 14.
