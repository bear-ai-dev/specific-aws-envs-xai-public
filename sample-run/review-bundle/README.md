# Grok 4.6 review bundle

This folder contains the code and evidence needed to audit the complete Grok
4.6 cohort. The cohort contains eight Grok failures and eight Opus solves on
the same frozen task.

| Folder | Contents |
| --- | --- |
| [`initial-files/`](initial-files/) | Exact frozen versions of the two existing source files modified in every Grok trial |
| [`grok-solution/`](grok-solution/) | Each Grok trial's exact final changed files, separated into folders numbered `01` through `08` |
| [`trajectories/grok/`](trajectories/grok/) | Eight native mini-SWE-agent JSON trajectories, numbered `01` through `08` |
| [`trajectories/opus/`](trajectories/opus/) | Eight native mini-SWE-agent JSON trajectories, numbered `01` through `08` |
| [`verifier/`](verifier/) | The Python code that calculates the expected invoice lines, checks the submitted output, and assigns the binary reward |
| [`verification-results/grok/`](verification-results/grok/) | One human-readable `report.txt` for each of the eight Grok trials |
| [`verification-results/opus/`](verification-results/opus/) | One human-readable `report.txt` for each of the eight Opus trials |

## Grok solution files by trial

| Trials | Final changed files |
| --- | --- |
| `01`, `02`, `04`, `05`, `07`, `08` | `offeringPackage.entity.ts`; `offeringPackage.entity.spec.ts` |
| `03`, `06` | `offeringPackage.entity.ts`; `offeringPackage.entity.spec.ts`; new `invoiceLineGatherer.service.spec.ts` |

The copies are placed directly inside each folder for easier review.
`initial-files/` contains the frozen versions of the two files that existed
before the trials. `grok-solution/trial-XX/` contains the final changed files
captured for that trial. The third file in Trials 3 and 6 was newly created, so
it has no matching initial file. No task-level oracle code is included.

## Verifier

[`compute_reward.py`](verifier/compute_reward.py) is the independent binary
reward scorer. It calculates the expected invoice lines, compares them with the
submitted output, and assigns a reward of `0.0` or `1.0`.

## Verification result

Every model trial has its own directory containing only `report.txt`. Each
report preserves the original verifier output and identifies the corresponding
checks in `compute_reward.py`.

For Grok Trial 1, both requested runs completed, but the scorer found five
missing zero-priced, zero-quantity invoice lines in `solstice-july`, producing
a binary reward of `0.0`.
