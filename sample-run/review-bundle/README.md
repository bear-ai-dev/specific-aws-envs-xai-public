# Model trajectory review bundles

This directory contains the reviewer-facing code and evidence for all eleven
tasks in the sample. Each task has eight Grok 4.6 trajectories and eight paired
Opus 5 trajectories.

Tasks 1 to 4 and 8 to 11 come from cohorts in which both arms share a task
checksum. Tasks 8 to 11 nevertheless keep the two Opus agent scaffolds in
separate four-run strata. Tasks 5 to 7 were built once per model arm, so each
arm carries its own recorded checksum and its own stratum; the published task
package is byte-identical to the package the Opus arm ran against, recorded as
`build_equivalence` in
[`frozen-cohort.json`](../manifests/frozen-cohort.json).

| Task | Grok | Opus | Review files |
| --- | ---: | ---: | --- |
| [Task 1: entitlement overage lines](../../tasks/01-entitlement-overage-lines/instruction.md) | 0/8 | 8/8 | [`01-entitlement-overage-lines/`](01-entitlement-overage-lines/) |
| [Task 2: multi-region sweep](../../tasks/02-multi-region-sweep/instruction.md) | 6/8 | 8/8 | [`02-multi-region-sweep/`](02-multi-region-sweep/) |
| [Task 3: IAM role validation](../../tasks/03-iam-role-validation/instruction.md) | 3/8 | 8/8 | [`03-iam-role-validation/`](03-iam-role-validation/) |
| [Task 4: tax jurisdiction](../../tasks/04-tax-jurisdiction/instruction.md) | 0/8 | 5/8 | [`04-tax-jurisdiction/`](04-tax-jurisdiction/) |
| [Task 5: network egress metering](../../tasks/05-network-egress-metering/instruction.md) | 3/8 | 8/8 | [`05-network-egress-metering/`](05-network-egress-metering/) |
| [Task 6: API token metering](../../tasks/06-api-token-metering/instruction.md) | 0/8 | 7/8 | [`06-api-token-metering/`](06-api-token-metering/) |
| [Task 7: API keys and environments](../../tasks/07-api-keys-and-environments/instruction.md) | 5/8 | 8/8 | [`07-api-keys-and-environments/`](07-api-keys-and-environments/) |
| [Task 8: dimension pricing tiers](../../tasks/08-dimension-pricing-tiers/instruction.md) | 2/8 | 7/8 | [`08-dimension-pricing-tiers/`](08-dimension-pricing-tiers/) |
| [Task 9: S3 datastore measurement](../../tasks/09-s3-datastore-measurement/instruction.md) | 0/8 | 6/8 | [`09-s3-datastore-measurement/`](09-s3-datastore-measurement/) |
| [Task 10: customer identity migration](../../tasks/10-customer-identity-migration/instruction.md) | 6/8 | 8/8 | [`10-customer-identity-migration/`](10-customer-identity-migration/) |
| [Task 11: customer billing-schedule migration](../../tasks/11-customer-billing-schedule-migration/instruction.md) | 0/8 | 5/8 | [`11-customer-billing-schedule-migration/`](11-customer-billing-schedule-migration/) |

All bundles use task-numbered subdirectories matching the report.

## Common artifact roles

| Folder | Contents |
| --- | --- |
| `touched-files/` | Every recoverable file Grok directly wrote, copied, reformatted, or deleted, separated by trial and original `/app` or `/tmp` path |
| `grok-solution/` | Each Grok trial's exact final changed files |
| `trajectories/grok/` | Eight native mini-SWE-agent Grok JSON trajectories |
| `trajectories/opus/` | Eight paired native Opus JSON trajectories; Tasks 8 to 11 contain four opencode and four mini-SWE-agent schemas |
| `verifier/execution/` | The Harbor verifier entry point and execution driver |
| `verifier/scoring/` | Held-out data, run specification, and independent binary scorer |
| `verification-results/` | Per-trial report, observation, reward, verifier stdout, and compact Harbor result |
| `controls/` | Recorded-runtime oracle and no-op evidence for Tasks 2 to 11; Task 1 controls remain in `sample-run/raw/xai-public-controls-20260819/` |

## Agent scaffold on Tasks 8 to 11

On those four tasks the Opus 5 arm ran attempts 01 to 04 under opencode 1.18.13
and attempts 05 to 08 under mini-SWE-agent 2.4.5, so its trajectories carry the
schema each scaffold emits. The Grok 4.6 arm is mini-SWE-agent throughout, and
that task family records each submission as a patch rather than a file snapshot.
The table's Opus totals are a descriptive inventory only; pass@k is calculated
separately for the two four-run strata.

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
2 through 11.
The separate
[`public control manifest`](../manifests/public-controls-validation.json)
records the oracle/no-op evidence, job stage, and publication task hashes for
all eleven tasks. Recorded-build controls are not represented as
post-normalization reruns.

The [Tasks 7–11 contract audit](tasks-07-11-contract-audit.md) maps the frozen
asks to the verifier and identifies ungraded behaviors that must not be used as
scored capability claims.
