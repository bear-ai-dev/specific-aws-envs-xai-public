# Task 14 — IAM role validation review bundle

The frozen matched cohort contains eight Grok 4.6 trials and eight Opus 5
trials: **Grok 3/8; Opus 8/8**. This is the primary directional Grok gap and
measures optional nested-configuration presence semantics plus atomic cloud
validation.

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

| Model | Trial | Harbor ID | Reward | Recorded runtime task checksum |
| --- | ---: | --- | ---: | --- |
| Grok 4.6 | `01` | `8kjsAAW` | 0 | `a0ce8d2b0f7ee76b6777add8da5e172683815037735668e761c00e8ee9da8ab2` |
| Grok 4.6 | `02` | `G84iXeU` | 0 | `a0ce8d2b0f7ee76b6777add8da5e172683815037735668e761c00e8ee9da8ab2` |
| Grok 4.6 | `03` | `tWXTsqC` | 0 | `a0ce8d2b0f7ee76b6777add8da5e172683815037735668e761c00e8ee9da8ab2` |
| Grok 4.6 | `04` | `xgnVmZg` | 0 | `a0ce8d2b0f7ee76b6777add8da5e172683815037735668e761c00e8ee9da8ab2` |
| Grok 4.6 | `05` | `vK7H2up` | 0 | `a0ce8d2b0f7ee76b6777add8da5e172683815037735668e761c00e8ee9da8ab2` |
| Grok 4.6 | `06` | `AHzaAmb` | 1 | `a0ce8d2b0f7ee76b6777add8da5e172683815037735668e761c00e8ee9da8ab2` |
| Grok 4.6 | `07` | `RgS83u6` | 1 | `a0ce8d2b0f7ee76b6777add8da5e172683815037735668e761c00e8ee9da8ab2` |
| Grok 4.6 | `08` | `u2o92Bn` | 1 | `a0ce8d2b0f7ee76b6777add8da5e172683815037735668e761c00e8ee9da8ab2` |
| Opus 5 | `01` | `YoeMfEt` | 1 | `a0ce8d2b0f7ee76b6777add8da5e172683815037735668e761c00e8ee9da8ab2` |
| Opus 5 | `02` | `DfssELR` | 1 | `a0ce8d2b0f7ee76b6777add8da5e172683815037735668e761c00e8ee9da8ab2` |
| Opus 5 | `03` | `t2Jw2x3` | 1 | `a0ce8d2b0f7ee76b6777add8da5e172683815037735668e761c00e8ee9da8ab2` |
| Opus 5 | `04` | `WWF7FvC` | 1 | `a0ce8d2b0f7ee76b6777add8da5e172683815037735668e761c00e8ee9da8ab2` |
| Opus 5 | `05` | `q23rYZH` | 1 | `a0ce8d2b0f7ee76b6777add8da5e172683815037735668e761c00e8ee9da8ab2` |
| Opus 5 | `06` | `97RzCfr` | 1 | `a0ce8d2b0f7ee76b6777add8da5e172683815037735668e761c00e8ee9da8ab2` |
| Opus 5 | `07` | `fbLgaJq` | 1 | `a0ce8d2b0f7ee76b6777add8da5e172683815037735668e761c00e8ee9da8ab2` |
| Opus 5 | `08` | `X6C4opo` | 1 | `a0ce8d2b0f7ee76b6777add8da5e172683815037735668e761c00e8ee9da8ab2` |

## Grok solution files by trial

| Trial | Final changed files |
| ---: | --- |
| `01` | `update-settings.dto.ts`; `settings.service.spec.ts`; `settings.service.ts`; `sts.spec.ts` (new); `sts.ts` (new) |
| `02` | `update-settings.dto.ts`; `settings.service.spec.ts`; `settings.service.ts`; `sts.spec.ts` (new); `sts.ts` (new) |
| `03` | `package.json`; `update-settings.dto.ts`; `settings.service.spec.ts`; `settings.service.ts`; `sts.ts` (new) |
| `04` | `update-settings.dto.ts`; `settings.service.spec.ts`; `settings.service.ts`; `sts.spec.ts` (new); `sts.ts` (new) |
| `05` | `update-settings.dto.ts`; `settings.service.spec.ts`; `settings.service.ts`; `awsEc2.ts` |
| `06` | `update-settings.dto.ts`; `settings.service.spec.ts`; `settings.service.ts`; `scraperRole.spec.ts` (new); `scraperRole.ts` (new) |
| `07` | `package.json`; `update-settings.dto.ts`; `settings.service.spec.ts`; `settings.service.ts`; `sts.spec.ts` (new); `sts.ts` (new) |
| `08` | `update-settings.dto.ts`; `settings.service.spec.ts`; `settings.service.ts`; `scraperRole.spec.ts` (new); `scraperRole.ts` (new) |

The final submitted copies are flattened into each `grok-solution` trial folder
for easier review; their original paths and source hashes are recorded in the
[published manifest](../../manifests/selected-review-bundles.json).
No task-level oracle code is included.

## Every recoverable file Grok touched

The `touched-files` tree contains **56 snapshots**, including
**16 paths absent at submission**. It combines final verifier snapshots
with the last contents recoverable from trajectory-visible heredoc writes and
copies. The trajectory remains authoritative for deletions or shell mutations
whose bytes cannot be reconstructed.

## Verifier

The driver replays 21 settings saves against held-out IAM accounts. The independent scorer derives whether each role is assumable, whether its credentials can read instance inventory, and the exact persisted state after every save.

The held-out document was unavailable to both models. The Python scorer runs as
root, loads no submitted code, and assigns only `0.0` or `1.0`. These are exact
task-file copies arranged by role; the unchanged runnable Harbor layout is the
[`14-iam-role-validation` task](../../../tasks/14-iam-role-validation/).

## Verification result

Every trial contains a reviewer annotation, unchanged verifier report, raw
observation, reward, verifier stdout, and compact Harbor result. The annotations
point to the independent reference rule and assertion rather than inferring
success from agent claims.

Trajectories preserve native mini-SWE-agent structure. Only credentials and
machine-local paths are redacted; the published manifest records the public
file hashes and recorded runtime task checksum.
