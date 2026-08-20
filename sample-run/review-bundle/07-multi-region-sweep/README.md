# Task 7 — multi-region sweep review bundle

The frozen matched cohort contains eight Grok 4.6 trials and eight Opus 5
trials. This is the secondary directional Grok gap and measures complete
multi-region work under partial failure.

## Headline result

| Model | Solves `c/n` | pass@1 | pass@3 | pass@8 |
| --- | ---: | ---: | ---: | ---: |
| Grok 4.6 | 6/8 | 0.7500 | 1.0000 | 1.0000 |
| Opus 5 | 8/8 | 1.0000 | 1.0000 | 1.0000 |

| Folder | Contents |
| --- | --- |
| [`touched-files/`](touched-files/) | Every recoverable file Grok directly wrote or copied, plus every final changed file, under its original `/app` or `/tmp` path |
| [`grok-solution/`](grok-solution/) | Each Grok trial's exact final changed files, separated into folders numbered `01` through `08` |
| [`trajectories/grok/`](trajectories/grok/) | Eight native mini-SWE-agent JSON trajectories, numbered `01` through `08` |
| [`trajectories/opus/`](trajectories/opus/) | Eight native mini-SWE-agent JSON trajectories, numbered `01` through `08` |
| [`verifier/execution/`](verifier/execution/) | The Harbor verifier entry point and TypeScript driver used to execute the submission and capture behavior |
| [`verifier/scoring/`](verifier/scoring/) | Held-out data, run specification, and independent Python scorer used to assign the binary reward |
| [`verification-results/grok/`](verification-results/grok/) | Report, observation, reward, verifier stdout, and compact Harbor result for each Grok trial |
| [`verification-results/opus/`](verification-results/opus/) | Report, observation, reward, verifier stdout, and compact Harbor result for each Opus trial |
| [`controls/`](controls/) | Recorded-runtime oracle and no-op results with complete verifier evidence |

## Cohort identity and result

| Model | Trial | Harbor ID | Reward |
| --- | ---: | --- | ---: |
| Grok 4.6 | `01` | `LRnKiSb` | 0 |
| Grok 4.6 | `02` | `ziRTof6` | 1 |
| Grok 4.6 | `03` | `bSLKM7d` | 1 |
| Grok 4.6 | `04` | `JfzoZNF` | 1 |
| Grok 4.6 | `05` | `cGPMwaF` | 1 |
| Grok 4.6 | `06` | `CCg8Gdh` | 1 |
| Grok 4.6 | `07` | `2gpT5uY` | 0 |
| Grok 4.6 | `08` | `UeB9aX2` | 1 |
| Opus 5 | `01` | `MhiXivB` | 1 |
| Opus 5 | `02` | `BRT56Qe` | 1 |
| Opus 5 | `03` | `goAiDo6` | 1 |
| Opus 5 | `04` | `saUGGWu` | 1 |
| Opus 5 | `05` | `ziABPaV` | 1 |
| Opus 5 | `06` | `9KLWqig` | 1 |
| Opus 5 | `07` | `LkGdudD` | 1 |
| Opus 5 | `08` | `74ZEoPP` | 1 |

## Grok solution files by trial

| Trial | Final changed files |
| ---: | --- |
| `01` | `awsEc2.spec.ts` (new); `awsEc2.ts` |
| `02` | `awsEc2.ts` |
| `03` | `awsEc2.spec.ts` (new); `awsEc2.ts` |
| `04` | `awsEc2.ts` |
| `05` | `awsEc2.ts` |
| `06` | `awsEc2.spec.ts` (new); `awsEc2.ts` |
| `07` | `awsEc2.spec.ts` (new); `awsEc2.ts` |
| `08` | `awsEc2.ts` |

The final submitted copies are flattened into each `grok-solution` trial folder
for easier review; their original paths and source hashes are recorded in the
[published manifest](../../manifests/selected-review-bundles.json).
No task-level oracle code is included.

## Every recoverable file Grok touched

The `touched-files` tree contains **69 snapshots**, including
**57 paths absent at submission**. It combines final verifier snapshots
with the last contents recoverable from trajectory-visible heredoc writes and
copies. The trajectory remains authoritative for deletions or shell mutations
whose bytes cannot be reconstructed.

## Verifier

The driver asks the submitted collector to sweep two resource kinds. The independent scorer derives the complete readable enabled-region set and exact resource IDs from the held-out estate.

The held-out document was unavailable to both models. The Python scorer runs as
root, loads no submitted code, and assigns only `0.0` or `1.0`. These are exact
task-file copies arranged by role; the unchanged runnable Harbor layout is the
[`07-multi-region-sweep` task](../../../tasks/07-multi-region-sweep/).

## Verification result

Every trial contains a reviewer annotation, unchanged verifier report, raw
observation, reward, verifier stdout, and compact Harbor result. The annotations
point to the independent reference rule and assertion rather than inferring
success from agent claims.

Trajectories preserve native mini-SWE-agent structure. Only credentials and
machine-local paths are redacted; the published manifest records the public
file hashes.
