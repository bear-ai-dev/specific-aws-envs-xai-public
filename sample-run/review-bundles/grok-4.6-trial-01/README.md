# Grok 4.6 Trial 1 review bundle

This folder contains the code and evidence needed to audit the representative
Grok 4.6 Trial 1 result. Grok received a reward of `0.0`; the complete cohort
contains eight Grok failures and eight Opus solves on the same frozen task.

| Folder | Contents |
| --- | --- |
| [`files/`](files/) | Exact frozen pre-edit versions of every source file changed by Grok Trial 1 |
| [`grok-solution/`](grok-solution/) | Exact final versions of those files from Grok Trial 1's captured workspace |
| [`trajectories/grok/`](trajectories/grok/) | Eight native mini-SWE-agent JSON trajectories, numbered `01` through `08` |
| [`trajectories/opus/`](trajectories/opus/) | Eight native mini-SWE-agent JSON trajectories, numbered `01` through `08` |
| [`verifier/`](verifier/) | Executable non-shell scorer and behavioral driver, plus their held-out scenario and run specification |
| [`verification-results/grok/`](verification-results/grok/) | Reward, report, observed output, and verifier stdout for all eight Grok trials |
| [`verification-results/opus/`](verification-results/opus/) | Reward, report, observed output, and verifier stdout for all eight Opus trials |

## Files changed by Grok Trial 1

- `offeringPackage.entity.spec.ts`
- `offeringPackage.entity.ts`

The copies are placed directly inside each folder for easier review. `files/`
contains the frozen base, while `grok-solution/` contains Grok's final submitted
versions. No task-level oracle code is included in `grok-solution/`.

## Verifier

The non-shell verifier materials are:

- `compute_reward.py`, the independent binary reward scorer;
- `drive.ts`, the behavioral driver that invokes the submitted collector;
- `holdout.json`, the held-out AWS-compatible scenario; and
- `run-spec.json`, the two billing runs exercised by the verifier.

The shell orchestration wrapper is intentionally excluded from this review
folder. Its recorded outputs are preserved under `verification-results/`.

## Verification result

Every model trial has its own directory containing:

- `reward.json`;
- `report.txt`;
- `observed.json`; and
- `test-stdout.txt`.

For Grok Trial 1, both requested runs completed, but the scorer found five
missing zero-priced, zero-quantity invoice lines in `solstice-july`, producing
a binary reward of `0.0`.
