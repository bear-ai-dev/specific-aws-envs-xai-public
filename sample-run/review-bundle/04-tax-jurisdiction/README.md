# Task 4 — tax jurisdiction review bundle

The packaged evidence contains eight Grok 4.6 trials and eight Opus 5 trials.
Trials 01–04 form one matched Daytona stratum; trials 05–08 form a separately
matched AWS Fargate stratum. The pooled eight-attempt count is descriptive and
is not represented as one frozen runtime configuration. Both strata show the
same directional Grok gap on exact tax-authority semantics.

## Headline pooled result

| Model | Solves `c/n` | pass@1 | pass@3 | pass@8 |
| --- | ---: | ---: | ---: | ---: |
| Grok 4.6 | 0/8 | 0.0000 | 0.0000 | 0.0000 |
| Opus 5 | 5/8 | 0.6250 | 0.9821 | 1.0000 |

## Runtime-stratified result

| Runtime stratum | Grok 4.6 | Opus 5 |
| --- | ---: | ---: |
| Daytona, trials 01–04 | 0/4 | 4/4 |
| AWS Fargate, trials 05–08 | 0/4 | 1/4 |

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
| Grok 4.6 | `01` | `x7ujgig` | 0 |
| Grok 4.6 | `02` | `GiJ8uUh` | 0 |
| Grok 4.6 | `03` | `avLpoWr` | 0 |
| Grok 4.6 | `04` | `d3UG8QH` | 0 |
| Grok 4.6 | `05` | `NK9mK9k` | 0 |
| Grok 4.6 | `06` | `e3oCZ3c` | 0 |
| Grok 4.6 | `07` | `WYPW3wd` | 0 |
| Grok 4.6 | `08` | `uNj8nCu` | 0 |
| Opus 5 | `01` | `o78gZ9C` | 1 |
| Opus 5 | `02` | `La3RrRt` | 1 |
| Opus 5 | `03` | `gALuhSv` | 1 |
| Opus 5 | `04` | `kVbSYYN` | 1 |
| Opus 5 | `05` | `7iUEesd` | 1 |
| Opus 5 | `06` | `dPw8uNH` | 0 |
| Opus 5 | `07` | `VixUG72` | 0 |
| Opus 5 | `08` | `zje9teA` | 0 |

## Grok solution files by trial

| Trial | Final changed files |
| ---: | --- |
| `01` | `InvoiceInfluxTable.entity.ts`, `create-Invoices.dto.ts`, `read-invoices.dto.ts`, `invoice.entity.ts`, `invoice.entity.spec.ts`, `taxJar.client.spec.ts` (new), `taxJar.client.ts` (new), `payment.entity.ts`, `update-settings.dto.ts`, `validTaxJarApiKey.ts` (new), `settings.service.spec.ts`, `settings.service.ts` |
| `02` | `invoice.entity.ts`, `invoice.entity.spec.ts`, `payment.entity.ts`, `update-settings.dto.ts`, `settings.service.ts`, `tax.service.spec.ts` (new), `tax.service.ts` (new), `taxJarApiKey.validator.ts` (new) |
| `03` | `read-invoices.dto.ts`, `invoice.entity.ts`, `invoice.entity.spec.ts`, `tax.spec.ts` (new), `tax.ts` (new), `update-settings.dto.ts`, `validTaxJarApiKey.ts` (new) |
| `04` | `invoice.entity.ts`, `invoice.entity.spec.ts`, `taxjar.util.spec.ts` (new), `taxjar.util.ts` (new), `payment.entity.ts`, `settings.service.spec.ts`, `settings.service.ts` |
| `05` | `invoice.entity.ts`, `invoice.entity.spec.ts`, `tax.entity.spec.ts` (new), `taxAuthority.ts` (new), `payment.entity.ts`, `validTaxJarApiKey.ts` (new), `settings.service.ts` |
| `06` | `invoice.entity.ts`, `payment.entity.ts`, `update-settings.dto.ts`, `validTaxJarApiKey.ts` (new), `settings.service.ts`, `taxAuthority.spec.ts` (new), `taxAuthority.ts` (new) |
| `07` | `InvoiceInfluxTable.entity.ts`, `create-Invoices.dto.ts`, `read-invoices.dto.ts`, `invoice.entity.ts`, `invoice.tax.spec.ts` (new), `payment.entity.ts`, `settings.service.ts`, `taxjarClient.ts` (new) |
| `08` | `app.module.ts`, `read-invoices.dto.ts`, `invoice.entity.ts`, `invoice.entity.spec.ts`, `invoices.module.ts`, `invoices.service.ts`, `payment.entity.ts`, `settings.module.ts`, `settings.service.ts`, `tax.module.ts` (new), `tax.service.spec.ts` (new), `tax.service.ts` (new) |

The final submitted copies are flattened into each `grok-solution` trial folder
for easier review; their original paths are recorded in the
[published manifest](../../manifests/selected-review-bundles.json).
No task-level oracle code is included.

## Every recoverable file Grok touched

The `touched-files` tree contains **68 snapshots** of the files Grok
submitted. Probe and scratch files that never reached submission are left in
the trajectory rather than reconstructed.

## Verifier

The driver asks the submitted service to exercise the held-out cases. The
independent scorer assigns only `0.0` or `1.0` from captured behavior. These
are exact task-file copies arranged by role; the unchanged runnable Harbor
layout is the [`04-tax-jurisdiction` task](../../../tasks/04-tax-jurisdiction/).

## Verification result

Every trial contains a reviewer annotation, unchanged verifier report, raw
observation, reward, verifier stdout, and compact Harbor result. The annotations
point to the independent reference rule and assertion rather than inferring
success from agent claims.

Trajectories preserve native mini-SWE-agent structure. Credentials,
machine-local paths, and source-linked identifiers are normalized; the
published manifest records the public file hashes.
