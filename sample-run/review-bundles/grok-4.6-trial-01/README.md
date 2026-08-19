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
| [`verifier/`](verifier/) | The Python code that calculates the expected invoice lines, checks the submitted output, and assigns the binary reward |
| [`verification-results/grok/`](verification-results/grok/) | One human-readable `report.txt` for each of the eight Grok trials |
| [`verification-results/opus/`](verification-results/opus/) | One human-readable `report.txt` for each of the eight Opus trials |

## Files changed by Grok Trial 1

- `offeringPackage.entity.spec.ts`
- `offeringPackage.entity.ts`

The copies are placed directly inside each folder for easier review. `files/`
contains the frozen base, while `grok-solution/` contains Grok's final submitted
versions. No task-level oracle code is included in `grok-solution/`.

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
