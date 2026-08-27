# Model trajectory review bundles

This directory contains the reviewer-facing code and evidence for the tasks in
the sample. Tasks 1 to 4 each have eight Grok 4.6 trajectories and eight paired
Opus 5 trajectories from a matched frozen cohort. Tasks 5 to 7 carry the Grok
4.6 arm only: their paired Opus 5 rollouts were run and scored, but those
trajectories are not in this tree yet, so those bundles have no
`trajectories/opus/` or `verification-results/opus/`.

| Task | Grok | Opus | Review files |
| --- | ---: | ---: | --- |
| [Task 1: entitlement overage lines](../../tasks/01-entitlement-overage-lines/instruction.md) | 0/8 | 8/8 | [`01-entitlement-overage-lines/`](01-entitlement-overage-lines/) |
| [Task 2: multi-region sweep](../../tasks/02-multi-region-sweep/instruction.md) | 6/8 | 8/8 | [`02-multi-region-sweep/`](02-multi-region-sweep/) |
| [Task 3: IAM role validation](../../tasks/03-iam-role-validation/instruction.md) | 3/8 | 8/8 | [`03-iam-role-validation/`](03-iam-role-validation/) |
| [Task 4: tax jurisdiction](../../tasks/04-tax-jurisdiction/instruction.md) | 0/8 | 5/8 | [`04-tax-jurisdiction/`](04-tax-jurisdiction/) |
| [Task 5: network egress metering](../../tasks/05-network-egress-metering/instruction.md) | 3/8 | not published | [`05-network-egress-metering/`](05-network-egress-metering/) |
| [Task 6: API token metering](../../tasks/06-api-token-metering/instruction.md) | 0/8 | not published | [`06-api-token-metering/`](06-api-token-metering/) |
| [Task 7: API keys and environments](../../tasks/07-api-keys-and-environments/instruction.md) | 5/8 | not published | [`07-api-keys-and-environments/`](07-api-keys-and-environments/) |

All bundles use task-numbered subdirectories matching the report.

## Common artifact roles

| Folder | Contents |
| --- | --- |
| `touched-files/` | Every recoverable file Grok directly wrote, copied, reformatted, or deleted, separated by trial and original `/app` or `/tmp` path |
| `grok-solution/` | Each Grok trial's exact final changed files |
| `trajectories/grok/` | Eight native mini-SWE-agent Grok JSON trajectories |
| `trajectories/opus/` | Eight paired native mini-SWE-agent Opus JSON trajectories (Tasks 1 to 4 only) |
| `verifier/execution/` | The Harbor verifier entry point and execution driver |
| `verifier/scoring/` | Held-out data, run specification, and independent binary scorer |
| `verification-results/` | Per-trial report, observation, reward, verifier stdout, and compact Harbor result |
| `controls/` | Recorded-runtime oracle and no-op evidence for Tasks 2 to 7; Task 1 controls remain in `sample-run/raw/xai-public-controls-20260819/` |

## Redacted credentials in Task 5

Task 5's Grok trajectories show the agent inspecting its own shell environment,
which at run time held working AWS credentials for the sandbox. Those values are
replaced with `<redacted-aws-credential: live at run time, masked for the public
sample>`. The task's own mock credentials, `LOCALMETERINGKEY01` and
`billing-secret`, are left in place: they are part of the published task and the
emulator it talks to. `harness/redact_review_bundles.py` performs the masking
and `harness/validate_publication.py` fails the build if a real key shape
survives anywhere in the tree.

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
