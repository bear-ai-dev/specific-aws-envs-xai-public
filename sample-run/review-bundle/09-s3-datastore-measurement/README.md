# Task 9 — S3 datastore measurement review bundle

The cohort contains eight Grok 4.6 trials and eight Opus 5 trials, both against the same recorded task checksum. It measures whether an agent provisions a scoped role and returns the ingestion and dead-letter locations in the documented form, and routes valid and malformed connector records to the right places.

## Headline result

| Model | Solves `c/n` | pass@1 | pass@3 | pass@8 |
| --- | ---: | ---: | ---: | ---: |
| Grok 4.6 | 0/8 | 0.0000 | 0.0000 | 0.0000 |
| Opus 5 | 6/8 | 0.7500 | 1.0000 | 1.0000 |

| Folder | Contents |
| --- | --- |
| [`touched-files/`](touched-files/) | The patch each Grok trial submitted, under its original path |
| [`grok-solution/`](grok-solution/) | Each Grok trial's submitted patch, in folders numbered `01` through `08` |
| [`trajectories/grok/`](trajectories/grok/) | Eight native mini-SWE-agent JSON trajectories |
| [`trajectories/opus/`](trajectories/opus/) | Eight Opus JSON trajectories; see the scaffold note below |
| [`verifier/execution/`](verifier/execution/) | The Harbor verifier entry point and driver |
| [`verifier/scoring/`](verifier/scoring/) | Held-out configuration and the independent scorer |
| [`verification-results/grok/`](verification-results/grok/) | Verifier output, reward and compact Harbor result per Grok trial |
| [`verification-results/opus/`](verification-results/opus/) | Verifier output, reward and compact Harbor result per Opus trial |
| [`controls/`](controls/) | Recorded-runtime oracle and no-op results |

## Cohort identity and result

| Model | Trial | Harbor ID | Reward | Scaffold |
| --- | ---: | --- | ---: | --- |
| Grok 4.6 | `01` | `MMpBfEq` | 0 | mini-swe-agent |
| Grok 4.6 | `02` | `otKqSYv` | 0 | mini-swe-agent |
| Grok 4.6 | `03` | `2bLbebV` | 0 | mini-swe-agent |
| Grok 4.6 | `04` | `TM8S9P7` | 0 | mini-swe-agent |
| Grok 4.6 | `05` | `hei9ruY` | 0 | mini-swe-agent |
| Grok 4.6 | `06` | `bmUbRwi` | 0 | mini-swe-agent |
| Grok 4.6 | `07` | `RKCqb2P` | 0 | mini-swe-agent |
| Grok 4.6 | `08` | `yxdPvVu` | 0 | mini-swe-agent |
| Opus 5 | `01` | `dgDV2b3` | 1 | opencode |
| Opus 5 | `02` | `qKUQ4qd` | 1 | opencode |
| Opus 5 | `03` | `hVZQ8gQ` | 0 | opencode |
| Opus 5 | `04` | `Yk2rrqa` | 1 | opencode |
| Opus 5 | `05` | `PQYdZX7` | 1 | mini-swe-agent |
| Opus 5 | `06` | `3BG8tWT` | 0 | mini-swe-agent |
| Opus 5 | `07` | `H2nfRzW` | 1 | mini-swe-agent |
| Opus 5 | `08` | `sYyyJd6` | 1 | mini-swe-agent |

## Agent scaffold

The Grok 4.6 arm ran under mini-SWE-agent 2.4.5 throughout. The Opus 5 arm ran
attempts 01 to 04 under opencode 1.18.13 and attempts 05 to 08 under
mini-SWE-agent 2.4.5, so its trajectories carry the schema each scaffold emits:
the opencode attempts use the normalised step schema and the mini-SWE-agent
attempts use the native message schema. Both are published unchanged.

## Every recoverable file Grok touched

The `touched-files` tree contains **8 submitted patches**. This task family
records the agent's submission as a patch rather than a file snapshot, so the patch
is the authoritative record of what changed.

## Verifier

The driver provisions datastore access and delivers connector records. The independent scorer checks the returned configuration, the role trust policy and external id, and where each record landed.

The held-out configuration was unavailable to both models. The scorer loads no
submitted code and assigns only `0.0` or `1.0`; the runnable Harbor layout is the
[`09-s3-datastore-measurement` task](../../../tasks/09-s3-datastore-measurement/).

## Publication note

This task's workspace is published here with organization names normalised to the
`meteringco` form the rest of the sample uses, and with tenant-identifying service
endpoints replaced by the example hosts. The task builds from `node:20-bookworm`
and the workspace in this repository, so it needs no external base image.

## Verification result

Every trial contains the unchanged verifier output, reward and compact Harbor
result. Trajectories preserve the structure each scaffold emitted; only
credentials, tenant endpoints and machine-local paths are redacted.
