# Task 5 — network egress metering review bundle

The cohort contains eight Grok 4.6 trials and eight Opus 5 trials. It measures whether an agent meters only the machines tagged for the dimension being billed, totals the bytes each one actually sent, and keeps charging for machines that have since stopped.

## Headline result

| Model | Solves `c/n` | pass@1 | pass@3 | pass@8 |
| --- | ---: | ---: | ---: | ---: |
| Grok 4.6 | 3/8 | 0.3750 | 0.8214 | 1.0000 |
| Opus 5 | 8/8 | 1.0000 | 1.0000 | 1.0000 |

| Folder | Contents |
| --- | --- |
| [`touched-files/`](touched-files/) | Every recoverable file Grok directly wrote or copied, under its original `/app` path |
| [`grok-solution/`](grok-solution/) | Each Grok trial's exact final changed files, in folders numbered `01` through `08` |
| [`trajectories/grok/`](trajectories/grok/) | Eight native mini-SWE-agent JSON trajectories, numbered `01` through `08` |
| [`trajectories/opus/`](trajectories/opus/) | Eight native mini-SWE-agent JSON trajectories, numbered `01` through `08` |
| [`verifier/execution/`](verifier/execution/) | The Harbor verifier entry point and driver used to execute the submission |
| [`verifier/scoring/`](verifier/scoring/) | Held-out data, run specification, and independent Python scorer |
| [`verification-results/grok/`](verification-results/grok/) | Report, observation, reward, verifier stdout, and compact Harbor result per Grok trial |
| [`verification-results/opus/`](verification-results/opus/) | Report, observation, reward, verifier stdout, and compact Harbor result per Opus trial |
| [`controls/`](controls/) | Recorded-runtime oracle and no-op results with complete verifier evidence |

## Cohort identity and result

| Model | Trial | Harbor ID | Reward |
| --- | ---: | --- | ---: |
| Grok 4.6 | `01` | `CcwFWHT` | 0 |
| Grok 4.6 | `02` | `YauqSzm` | 0 |
| Grok 4.6 | `03` | `DeNhZS7` | 0 |
| Grok 4.6 | `04` | `6wTbYsV` | 1 |
| Grok 4.6 | `05` | `rmYH6HN` | 0 |
| Grok 4.6 | `06` | `fsza56L` | 0 |
| Grok 4.6 | `07` | `YncEKWS` | 1 |
| Grok 4.6 | `08` | `HJWqTve` | 1 |
| Opus 5 | `01` | `iDgJRpz` | 1 |
| Opus 5 | `02` | `usY8woo` | 1 |
| Opus 5 | `03` | `i7NEP8f` | 1 |
| Opus 5 | `04` | `JbtRLne` | 1 |
| Opus 5 | `05` | `dAdwrtq` | 1 |
| Opus 5 | `06` | `XZTGmcc` | 1 |
| Opus 5 | `07` | `3woPgF4` | 1 |
| Opus 5 | `08` | `YnCuAxx` | 1 |

## Grok solution files by trial

| Trial | Final changed files |
| ---: | --- |
| `01` | `app.module.ts`; `awsCloudwatch.spec.ts`; `awsCloudwatch.ts`; `create-dimension.dto.ts`; `dimensions.service.ts`; `ec2NetworkOutDataGatherer.dto.ts`; `ec2NetworkOutDataGatherer.module.ts`; `ec2NetworkOutDataGatherer.service.spec.ts`; `ec2NetworkOutDataGatherer.service.ts`; `measurement-config.entity.ts`; `scheduler.dto.ts`; `scheduler.entity.ts` |
| `02` | `app.module.ts`; `awsCloudWatch.ts`; `create-dimension.dto.ts`; `dimensions.service.ts`; `ec2NetworkOutDataGatherer.dto.ts`; `ec2NetworkOutDataGatherer.module.ts`; `ec2NetworkOutDataGatherer.service.spec.ts`; `ec2NetworkOutDataGatherer.service.ts`; `measurement-config.entity.ts`; `measurement-config.service.ts`; `scheduler.dto.ts`; `scheduler.entity.ts` |
| `03` | `app.module.ts`; `awsCloudWatch.spec.ts`; `awsCloudWatch.ts`; `create-dimension.dto.ts`; `dimensions.service.ts`; `ec2NetworkOutDataGatherer.dto.ts`; `ec2NetworkOutDataGatherer.module.ts`; `ec2NetworkOutDataGatherer.service.spec.ts`; `ec2NetworkOutDataGatherer.service.ts`; `measurement-config.entity.ts`; `measurement-config.service.ts`; `scheduler.dto.ts`; `scheduler.entity.ts` |
| `04` | `app.module.ts`; `awsCloudWatch.ts`; `create-dimension.dto.ts`; `dimensions.service.ts`; `ec2NetworkOutDataGatherer.dto.ts`; `ec2NetworkOutDataGatherer.module.ts`; `ec2NetworkOutDataGatherer.service.ts`; `measurement-config.entity.ts`; `scheduler.dto.ts`; `scheduler.entity.ts` |
| `05` | `app.module.ts`; `awsClient.ts`; `awsCloudWatch.ts`; `awsEc2.ts`; `create-dimension.dto.ts`; `customIAMAuthorizer.ts`; `dimensions.service.ts`; `ebsSnapshotDataGatherer.service.ts`; `ebsvolumeDataGatherer.service.ts`; `ec2InstanceDataGatherer.service.ts`; `ec2NetworkOutDataGatherer.dto.ts`; `ec2NetworkOutDataGatherer.module.ts`; `ec2NetworkOutDataGatherer.service.spec.ts`; `ec2NetworkOutDataGatherer.service.ts`; `instanceUptime.service.ts`; `measurement-config.entity.ts`; `reservedInstance.service.ts`; `scheduler.dto.ts`; `scheduler.entity.ts` |
| `06` | `app.module.ts`; `awsCloudWatch.ts`; `awsEc2.ts`; `create-dimension.dto.ts`; `dimensions.service.ts`; `ec2NetworkOutDataGatherer.dto.ts`; `ec2NetworkOutDataGatherer.module.ts`; `ec2NetworkOutDataGatherer.service.spec.ts`; `ec2NetworkOutDataGatherer.service.ts`; `measurement-config.entity.ts`; `scheduler.dto.ts`; `scheduler.entity.ts` |
| `07` | `app.module.ts`; `awsCloudWatch.ts`; `create-dimension.dto.ts`; `dimensions.service.ts`; `ec2NetworkOutDataGatherer.dto.ts`; `ec2NetworkOutDataGatherer.module.ts`; `ec2NetworkOutDataGatherer.service.spec.ts`; `ec2NetworkOutDataGatherer.service.ts`; `measurement-config.entity.ts`; `scheduler.dto.ts`; `scheduler.entity.ts` |
| `08` | `app.module.ts`; `awsCloudWatch.ts`; `create-dimension.dto.ts`; `dimensions.service.ts`; `ec2NetworkOutDataGatherer.dto.ts`; `ec2NetworkOutDataGatherer.module.ts`; `ec2NetworkOutDataGatherer.service.ts`; `measurement-config.entity.ts`; `measurement-config.service.ts`; `scheduler.dto.ts`; `scheduler.entity.ts` |

The final submitted copies are flattened into each `grok-solution` trial folder
for easier review; their original paths and source hashes are recorded in the
[published manifest](../../manifests/selected-review-bundles.json).
No task-level oracle code is included.

## Every recoverable file Grok touched

The `touched-files` tree contains **100 snapshots** under their original `/app`
paths. It is built from the final verifier snapshot of each trial, diffed against the
no-op control's deliverable so only files the trial actually changed appear.

## Verifier

The driver runs two recorded egress windows against held-out instance and tag fixtures. The independent scorer derives the byte total each customer owes per dimension and compares the usage records the submission wrote.

The held-out document was unavailable to both models. The Python scorer runs as
root, loads no submitted code, and assigns only `0.0` or `1.0`. These are exact
task-file copies arranged by role; the unchanged runnable Harbor layout is the
[`05-network-egress-metering` task](../../../tasks/05-network-egress-metering/).

## Build provenance

The two arms were built as separate Harbor jobs, so each carries its own recorded
task checksum and its own stratum in `harness/cohort_provenance.py`. The task package
published here is byte-identical to the package the Opus arm ran against, recorded as
`build_equivalence` in [`frozen-cohort.json`](../../manifests/frozen-cohort.json), so
the arms remain comparable.

## Verification result

Every trial contains the unchanged verifier report, raw observation, reward, verifier
stdout, and compact Harbor result.

Trajectories preserve native mini-SWE-agent structure. Only credentials and
machine-local paths are redacted; the published manifest records the public
file hashes.
