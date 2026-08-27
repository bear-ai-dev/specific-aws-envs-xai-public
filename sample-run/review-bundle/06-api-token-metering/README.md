# Task 6 — API token metering review bundle

The cohort contains eight Grok 4.6 trials and eight Opus 5 trials. It measures whether an agent records each API call against the platform's own customer at the time of the call, keeps calls apart by identity, counts a redelivered call once, and rolls each window up into one billable figure.

## Headline result

| Model | Solves `c/n` | pass@1 | pass@3 | pass@8 |
| --- | ---: | ---: | ---: | ---: |
| Grok 4.6 | 0/8 | 0.0000 | 0.0000 | 0.0000 |
| Opus 5 | 7/8 | 0.8750 | 1.0000 | 1.0000 |

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
| Grok 4.6 | `01` | `c69aeW5` | 0 |
| Grok 4.6 | `02` | `yf4ScsB` | 0 |
| Grok 4.6 | `03` | `P3FrPVG` | 0 |
| Grok 4.6 | `04` | `a2mNRMv` | 0 |
| Grok 4.6 | `05` | `EpCWPD3` | 0 |
| Grok 4.6 | `06` | `6fshRfT` | 0 |
| Grok 4.6 | `07` | `r6v9vmR` | 0 |
| Grok 4.6 | `08` | `9rvurJ4` | 0 |
| Opus 5 | `01` | `mLYHQk6` | 1 |
| Opus 5 | `02` | `dFqRewy` | 0 |
| Opus 5 | `03` | `FDgQ6Kv` | 1 |
| Opus 5 | `04` | `kT66YXy` | 1 |
| Opus 5 | `05` | `m4C8tHv` | 1 |
| Opus 5 | `06` | `aNqckDc` | 1 |
| Opus 5 | `07` | `mTJHTJM` | 1 |
| Opus 5 | `08` | `xKCVDGW` | 1 |

## Grok solution files by trial

| Trial | Final changed files |
| ---: | --- |
| `01` | `measurement.module.ts`; `measurement.service.ts`; `token-consumer-async-processor.ts`; `token-consumer.controller.spec.ts`; `token-consumer.entity.ts`; `token-consumer.module.ts`; `token-consumer.platform-metering.spec.ts`; `token-consumer.service.spec.ts`; `token-consumer.service.ts`; `tokenRegisterInterceptor.ts`; `usage.service.ts` |
| `02` | `measurement.controller.ts`; `scheduler.entity.ts`; `token-consumer-async-processor.ts`; `token-consumer.controller.spec.ts`; `token-consumer.entity.ts`; `token-consumer.module.ts`; `token-consumer.service.spec.ts`; `token-consumer.service.ts`; `tokenRegisterInterceptor.ts`; `usage.controller.ts`; `usage.service.ts` |
| `03` | `measurement.module.ts`; `measurement.service.ts`; `onboarding.entity.ts`; `scheduler.entity.ts`; `token-consumer-async-processor.spec.ts`; `token-consumer-async-processor.ts`; `token-consumer.controller.ts`; `token-consumer.entity.ts`; `token-consumer.service.spec.ts`; `token-consumer.service.ts`; `tokenRegisterInterceptor.ts`; `usage.service.ts` |
| `04` | `measurement.module.ts`; `measurement.service.ts`; `onboarding.entity.ts`; `token-consumer-async-processor.ts`; `token-consumer.controller.spec.ts`; `token-consumer.entity.spec.ts`; `token-consumer.entity.ts`; `token-consumer.module.ts`; `token-consumer.service.spec.ts`; `token-consumer.service.ts`; `tokenRegisterInterceptor.ts`; `usage.service.ts` |
| `05` | `influx.service.ts`; `measurement.module.ts`; `measurement.service.ts`; `token-consumer-async-processor.ts`; `token-consumer.controller.ts`; `token-consumer.entity.ts`; `token-consumer.service.ts`; `tokenRegisterInterceptor.ts`; `usage.service.ts` |
| `06` | `measurement.controller.ts`; `measurement.module.ts`; `scheduler.entity.ts`; `token-consumer-async-processor.ts`; `token-consumer.entity.ts`; `token-consumer.metering.spec.ts`; `token-consumer.service.ts`; `tokenRegisterInterceptor.ts`; `usage.controller.ts`; `usage.service.ts` |
| `07` | `measurement.module.ts`; `measurement.service.ts`; `onboarding.entity.ts`; `scheduler.entity.ts`; `token-consumer-async-processor.ts`; `token-consumer.controller.ts`; `token-consumer.entity.ts`; `token-consumer.metering.spec.ts`; `token-consumer.service.ts`; `tokenRegisterInterceptor.ts`; `usage.service.ts` |
| `08` | `measurement.module.ts`; `measurement.service.ts`; `onboarding.entity.ts`; `scheduler.entity.ts`; `token-consumer-async-processor.ts`; `token-consumer.entity.ts`; `token-consumer.metering.spec.ts`; `token-consumer.service.ts`; `tokenRegisterInterceptor.ts`; `usage.service.ts` |

The final submitted copies are flattened into each `grok-solution` trial folder
for easier review; their original paths and source hashes are recorded in the
[published manifest](../../manifests/selected-review-bundles.json).
No task-level oracle code is included.

## Every recoverable file Grok touched

The `touched-files` tree contains **86 snapshots** under their original `/app`
paths. It is built from the final verifier snapshot of each trial, diffed against the
no-op control's deliverable so only files the trial actually changed appear.

## Verifier

The driver replays two periods of API traffic including a redelivery, a late arrival and two calls sharing one millisecond. The independent scorer checks registration shape, call-time placement, idempotency, the windowed roll-up and the account it bills.

The held-out document was unavailable to both models. The Python scorer runs as
root, loads no submitted code, and assigns only `0.0` or `1.0`. These are exact
task-file copies arranged by role; the unchanged runnable Harbor layout is the
[`06-api-token-metering` task](../../../tasks/06-api-token-metering/).

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
