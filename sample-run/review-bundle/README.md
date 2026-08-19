# Grok 4.6 review bundle

This folder contains the code and evidence needed to audit the complete Grok
4.6 cohort. The cohort contains eight Grok failures and eight Opus solves on
the same frozen task.

| Folder | Contents |
| --- | --- |
| [`touched-files/`](touched-files/) | Every file Grok directly wrote, copied, reformatted, or deleted, separated by trial and stored under its original `/app` or `/tmp` path |
| [`grok-solution/`](grok-solution/) | Each Grok trial's exact final changed files, separated into folders numbered `01` through `08` |
| [`trajectories/grok/`](trajectories/grok/) | Eight native mini-SWE-agent JSON trajectories, numbered `01` through `08` |
| [`trajectories/opus/`](trajectories/opus/) | Eight native mini-SWE-agent JSON trajectories, numbered `01` through `08` |
| [`verifier/execution/`](verifier/execution/) | The Harbor verifier entry point and TypeScript driver that execute the submitted collector and record its output |
| [`verifier/scoring/`](verifier/scoring/) | The held-out account data, run specification, and independent Python scorer used to calculate the binary reward |
| [`verification-results/grok/`](verification-results/grok/) | One human-readable `report.txt` for each of the eight Grok trials |
| [`verification-results/opus/`](verification-results/opus/) | One human-readable `report.txt` for each of the eight Opus trials |

## Grok solution files by trial

| Trials | Final changed files |
| --- | --- |
| `01`, `02`, `04`, `05`, `07`, `08` | `offeringPackage.entity.ts`; `offeringPackage.entity.spec.ts` |
| `03`, `06` | `offeringPackage.entity.ts`; `offeringPackage.entity.spec.ts`; new `invoiceLineGatherer.service.spec.ts` |

The final submitted copies are placed directly inside each `grok-solution`
trial folder for easier review. The third solution file in Trials 3 and 6 was
newly created during those trials. No task-level oracle code is included.

## Every file Grok touched

[`touched-files/`](touched-files/) contains one folder per trial.
Within each trial, the `app/` and `tmp/` directories mirror the file's original
location in the sandbox. This includes the submitted source edits, temporary
reproduction scripts, copied debugging scripts, new tests, and files Grok later
deleted.

Repeated writes to the same path are represented by the last recoverable
contents at that path. Across the eight trials, the folder contains 43 file
snapshots, including 20 files that Grok deleted before submission. Those
deletions remain visible in the corresponding trajectory JSON.

## Verifier

[`execution/test.sh`](verifier/execution/test.sh) is the Harbor verifier entry
point. It replaces the agent-facing emulator with the held-out emulator and
runs [`execution/drive.ts`](verifier/execution/drive.ts) inside the submitted
workspace to collect raw invoice lines.

The held-out account document and requested business runs are preserved in
[`scoring/holdout.json`](verifier/scoring/holdout.json) and
[`scoring/run-spec.json`](verifier/scoring/run-spec.json). They were hidden
from the models during the recorded trials. The independent
[`scoring/compute_reward.py`](verifier/scoring/compute_reward.py) calculates the
expected invoice lines, compares them with the driver's observations, and
assigns a binary reward of `0.0` or `1.0`.

These are exact task-file copies arranged by role for review. The unchanged,
runnable Harbor directory layout is in the
[`02-entitlement-overage-lines` task](../../tasks/02-entitlement-overage-lines/).

## Verification result

Every model trial has its own directory containing only `report.txt`. Each
report preserves the original verifier output and identifies the corresponding
checks in `scoring/compute_reward.py`.

For Grok Trial 1, both requested runs completed, but the scorer found five
missing zero-priced, zero-quantity invoice lines in `solstice-july`, producing
a binary reward of `0.0`.
