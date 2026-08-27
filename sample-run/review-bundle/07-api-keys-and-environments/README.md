# Task 7 — API keys and environments review bundle

The cohort contains eight Grok 4.6 trials and eight Opus 5 trials. It measures whether an agent keeps sandbox and production credentials separate, rotates one secret without touching the others, and retires a credential so it stops authenticating on the very next request.

## Headline result

| Model | Solves `c/n` | pass@1 | pass@3 | pass@8 |
| --- | ---: | ---: | ---: | ---: |
| Grok 4.6 | 5/8 | 0.6250 | 0.9821 | 1.0000 |
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
| Grok 4.6 | `01` | `J7t3Ba7` | 0 |
| Grok 4.6 | `02` | `iJ5qrxX` | 0 |
| Grok 4.6 | `03` | `cRxxFnz` | 1 |
| Grok 4.6 | `04` | `bUxw5Uk` | 1 |
| Grok 4.6 | `05` | `QuiJExH` | 1 |
| Grok 4.6 | `06` | `L4JncfH` | 1 |
| Grok 4.6 | `07` | `FFY37gS` | 1 |
| Grok 4.6 | `08` | `rDGxZLL` | 0 |
| Opus 5 | `01` | `QYCehfc` | 1 |
| Opus 5 | `02` | `YZ8coTn` | 1 |
| Opus 5 | `03` | `pd7TT7H` | 1 |
| Opus 5 | `04` | `FC9Aa6b` | 1 |
| Opus 5 | `05` | `7Fs7DDo` | 1 |
| Opus 5 | `06` | `hgZ7Kuu` | 1 |
| Opus 5 | `07` | `uJqhEyH` | 1 |
| Opus 5 | `08` | `A5HTxCh` | 1 |

## Grok solution files by trial

| Trial | Final changed files |
| ---: | --- |
| `01` | `app.module.ts`; `environment.entity.ts`; `key.entity.ts`; `keys.controller.spec.ts`; `keys.controller.ts`; `keys.module.ts`; `keys.service.spec.ts`; `keys.service.ts`; `openApiSpecGenerator.ts`; `read-keys.dto.ts`; `update-environment.dto.ts`; `users.controller.ts`; `users.module.ts`; `users.service.ts` |
| `02` | `app.module.ts`; `environment.entity.ts`; `key.entity.ts`; `keys.controller.spec.ts`; `keys.controller.ts`; `keys.module.ts`; `keys.service.spec.ts`; `keys.service.ts`; `openApiSpecGenerator.ts`; `read-key.dto.ts`; `update-environment.dto.ts`; `users.controller.ts`; `users.module.ts`; `users.service.ts` |
| `03` | `app.module.ts`; `environment.entity.ts`; `key.entity.ts`; `keys.controller.spec.ts`; `keys.controller.ts`; `keys.module.ts`; `keys.service.spec.ts`; `keys.service.ts`; `openApiSpecGenerator.ts`; `read-key.dto.ts`; `update-environment.dto.ts`; `users.controller.ts`; `users.module.ts`; `users.service.spec.ts`; `users.service.ts` |
| `04` | `app.module.ts`; `environment.entity.ts`; `keys.controller.spec.ts`; `keys.controller.ts`; `keys.module.ts`; `keys.service.spec.ts`; `keys.service.ts`; `openApiSpecGenerator.ts`; `read-key.dto.ts`; `update-environment.dto.ts`; `users.controller.ts`; `users.module.ts`; `users.service.spec.ts`; `users.service.ts` |
| `05` | `app.module.ts`; `environment.entity.ts`; `key.entity.ts`; `keys.controller.spec.ts`; `keys.controller.ts`; `keys.module.ts`; `keys.service.spec.ts`; `keys.service.ts`; `openApiSpecGenerator.ts`; `read-key.dto.ts`; `update-environment.dto.ts`; `users.controller.ts`; `users.module.ts`; `users.service.spec.ts`; `users.service.ts` |
| `06` | `environment.controller.spec.ts`; `environment.controller.ts`; `environment.entity.ts`; `environment.service.spec.ts`; `keys.controller.spec.ts`; `keys.controller.ts`; `keys.service.spec.ts`; `keys.service.ts`; `read-key.dto.ts`; `update-environment.dto.ts`; `users.module.ts`; `users.service.ts` |
| `07` | `app.module.ts`; `environment.entity.ts`; `key.entity.ts`; `keys.controller.spec.ts`; `keys.controller.ts`; `keys.module.ts`; `keys.service.spec.ts`; `keys.service.ts`; `openApiSpecGenerator.ts`; `read-key.dto.ts`; `update-environment.dto.ts`; `users.controller.ts`; `users.module.ts`; `users.service.spec.ts`; `users.service.ts` |
| `08` | `app.module.ts`; `environment.controller.spec.ts`; `environment.controller.ts`; `environment.entity.ts`; `keys.controller.spec.ts`; `keys.controller.ts`; `keys.module.ts`; `keys.service.spec.ts`; `keys.service.ts`; `openApiSpecGenerator.ts`; `read-key.dto.ts`; `update-environment.dto.ts`; `users.module.ts`; `users.service.spec.ts`; `users.service.ts` |

The final submitted copies are flattened into each `grok-solution` trial folder
for easier review; their original paths and source hashes are recorded in the
[published manifest](../../manifests/selected-review-bundles.json).
No task-level oracle code is included.

## Every recoverable file Grok touched

The `touched-files` tree contains **114 snapshots** under their original `/app`
paths. It is built from the final verifier snapshot of each trial, diffed against the
no-op control's deliverable so only files the trial actually changed appear.

## Verifier

The driver exercises eight named rules against a local identity-provider emulator, covering listing, rotation, revocation, cross-tenant and cross-environment refusal, and read-only permissions.

The held-out document was unavailable to both models. The Python scorer runs as
root, loads no submitted code, and assigns only `0.0` or `1.0`. These are exact
task-file copies arranged by role; the unchanged runnable Harbor layout is the
[`07-api-keys-and-environments` task](../../../tasks/07-api-keys-and-environments/).

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
