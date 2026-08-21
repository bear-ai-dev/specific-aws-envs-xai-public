# Task 31 — customer onboarding review bundle

The packaged evidence contains eight Grok 4.6 trials and eight Opus 5 trials.
Trials 01–04 form one matched Daytona stratum; trials 05–08 form a separately
matched AWS Fargate stratum. The pooled eight-attempt count is descriptive and
is not represented as one frozen runtime configuration. Both strata show the
same directional Grok gap on shared context across collaborators.

## Headline pooled result

| Model | Solves `c/n` | pass@1 | pass@3 | pass@8 |
| --- | ---: | ---: | ---: | ---: |
| Grok 4.6 | 0/8 | 0.0000 | 0.0000 | 0.0000 |
| Opus 5 | 5/8 | 0.6250 | 0.9821 | 1.0000 |

## Runtime-stratified result

| Runtime stratum | Grok 4.6 | Opus 5 |
| --- | ---: | ---: |
| Daytona, trials 01–04 | 0/4 | 3/4 |
| AWS Fargate, trials 05–08 | 0/4 | 2/4 |

| Folder | Contents |
| --- | --- |
| [`touched-files/`](touched-files/) | Final submitted copies under their original `/app` paths |
| [`grok-solution/`](grok-solution/) | Each Grok trial's exact final changed files, separated into folders numbered `01` through `08` |
| [`trajectories/grok/`](trajectories/grok/) | Eight native mini-SWE-agent JSON trajectories, numbered `01` through `08` |
| [`trajectories/opus/`](trajectories/opus/) | Eight native mini-SWE-agent JSON trajectories, numbered `01` through `08` |
| [`verifier/execution/`](verifier/execution/) | The Harbor verifier entry point and TypeScript driver used to execute the submission and capture behavior |
| [`verifier/scoring/`](verifier/scoring/) | Held-out data, run specification, and independent Python scorer used to assign the binary reward |
| [`verification-results/grok/`](verification-results/grok/) | Report, observation, reward, verifier stdout, and compact Harbor result for each Grok trial |
| [`verification-results/opus/`](verification-results/opus/) | Report, observation, reward, verifier stdout, and compact Harbor result for each Opus trial |
| [`controls/`](controls/) | Recorded Daytona-stratum oracle and no-op results with complete verifier evidence |

## Cohort identity and result

| Model | Trial | Harbor ID | Reward |
| --- | ---: | --- | ---: |
| Grok 4.6 | `01` | `RqnwkPF` | 0 |
| Grok 4.6 | `02` | `mWx7WmF` | 0 |
| Grok 4.6 | `03` | `jMsyVgn` | 0 |
| Grok 4.6 | `04` | `mibN9zf` | 0 |
| Grok 4.6 | `05` | `Z4cyCVD` | 0 |
| Grok 4.6 | `06` | `Ue9arPU` | 0 |
| Grok 4.6 | `07` | `DeEiw4d` | 0 |
| Grok 4.6 | `08` | `jMW3M8b` | 0 |
| Opus 5 | `01` | `oKHjXnK` | 1 |
| Opus 5 | `02` | `mKiRQ92` | 0 |
| Opus 5 | `03` | `8Rg9Jn9` | 1 |
| Opus 5 | `04` | `oNp474i` | 1 |
| Opus 5 | `05` | `mpd2WXD` | 0 |
| Opus 5 | `06` | `PcvsnzH` | 1 |
| Opus 5 | `07` | `8JC53Jm` | 0 |
| Opus 5 | `08` | `s8RgTgd` | 1 |

## Grok solution files by trial

| Trial | Final changed files |
| ---: | --- |
| `01` | `customer.controller.ts`, `customer.service.spec.ts`, `customer.service.ts` |
| `02` | `customer.controller.ts`, `customer.service.ts` |
| `03` | `customer.controller.ts`, `customer.service.spec.ts`, `customer.service.ts` |
| `04` | `customer.controller.ts`, `customer.service.spec.ts`, `customer.service.ts` |
| `05` | `customer.controller.ts`, `customer.service.ts` |
| `06` | `customer.controller.ts`, `customer.service.ts` |
| `07` | `customer.controller.ts`, `customer.service.ts` |
| `08` | `customer.controller.ts`, `customer.service.spec.ts`, `customer.service.ts` |

The final submitted copies are flattened into each `grok-solution` trial folder
for easier review; their original paths are recorded in the
[published manifest](../../manifests/selected-review-bundles.json).
No task-level oracle code is included.

## Every recoverable file Grok touched

The `touched-files` tree contains **20 snapshots** of the files Grok
submitted. Probe and scratch files that never reached submission are left in
the trajectory rather than reconstructed.

## Verifier

The driver asks the submitted service to exercise the held-out cases. The
independent scorer assigns only `0.0` or `1.0` from captured behavior. These
are exact task-file copies arranged by role; the unchanged runnable Harbor
layout is the [`31-customer-onboarding` task](../../../tasks/31-customer-onboarding/).

## Verification result

Every trial contains a reviewer annotation, unchanged verifier report, raw
observation, reward, verifier stdout, and compact Harbor result. The annotations
point to the independent reference rule and assertion rather than inferring
success from agent claims.

Trajectories preserve native mini-SWE-agent structure. Credentials,
machine-local paths, and source-linked identifiers are normalized; the
published manifest records the public file hashes.
