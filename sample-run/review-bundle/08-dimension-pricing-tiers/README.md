# Task 8 — dimension pricing tiers review bundle

The cohort contains eight Grok 4.6 trials and eight Opus 5 trials, both against the same recorded task checksum. It measures whether an agent validates and stores volume pricing tiers, allocates usage across their bounds, divides quantities by the usage increment, and names each tier's invoice line the way the repository already names lines.

## Headline result

| Model | Solves `c/n` | pass@1 | pass@3 | pass@8 |
| --- | ---: | ---: | ---: | ---: |
| Grok 4.6 | 2/8 | 0.2500 | 0.6429 | 1.0000 |
| Opus 5 | 7/8 | 0.8750 | 1.0000 | 1.0000 |

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
| Grok 4.6 | `01` | `KQTevpU` | 0 | mini-swe-agent |
| Grok 4.6 | `02` | `EDJPViS` | 1 | mini-swe-agent |
| Grok 4.6 | `03` | `tPN7Lfr` | 0 | mini-swe-agent |
| Grok 4.6 | `04` | `mNBXao6` | 0 | mini-swe-agent |
| Grok 4.6 | `05` | `AguT9kM` | 0 | mini-swe-agent |
| Grok 4.6 | `06` | `DK2n6Rs` | 0 | mini-swe-agent |
| Grok 4.6 | `07` | `bWFAmFc` | 1 | mini-swe-agent |
| Grok 4.6 | `08` | `aJm3kox` | 0 | mini-swe-agent |
| Opus 5 | `01` | `U6Lr6XC` | 1 | opencode |
| Opus 5 | `02` | `6CGgAvu` | 1 | opencode |
| Opus 5 | `03` | `9eBPSsB` | 1 | opencode |
| Opus 5 | `04` | `rX4cu7n` | 1 | opencode |
| Opus 5 | `05` | `UuSyUhV` | 0 | mini-swe-agent |
| Opus 5 | `06` | `JF7WKei` | 1 | mini-swe-agent |
| Opus 5 | `07` | `ZMtuSDa` | 1 | mini-swe-agent |
| Opus 5 | `08` | `yxnPavu` | 1 | mini-swe-agent |

## Agent scaffold

The Grok 4.6 arm ran under mini-SWE-agent 2.4.5 throughout. The Opus 5 arm ran
attempts 01 to 04 under opencode 1.18.13 and attempts 05 to 08 under
mini-SWE-agent 2.4.5, so its trajectories carry the schema each scaffold emits:
the opencode attempts use the normalised step schema and the mini-SWE-agent
attempts use the native message schema. Both are published unchanged.

## Every recoverable file Grok touched

The `touched-files` tree contains **7 submitted patches**. This task family
records the agent's submission as a patch rather than a file snapshot, so the patch
is the authoritative record of what changed.

## Verifier

The driver builds invoices over held-out tiered dimensions. The independent scorer checks tier persistence, the line produced per consumed tier, its quantity after the usage increment, and its name.

The held-out configuration was unavailable to both models. The scorer loads no
submitted code and assigns only `0.0` or `1.0`; the runnable Harbor layout is the
[`08-dimension-pricing-tiers` task](../../../tasks/08-dimension-pricing-tiers/).

## Publication note

This task's workspace is published here with organization names normalised to the
`meteringco` form the rest of the sample uses, and with tenant-identifying service
endpoints replaced by the example hosts. The task builds from `node:20-bookworm`
and the workspace in this repository, so it needs no external base image.

## Verification result

Every trial contains the unchanged verifier output, reward and compact Harbor
result. Trajectories preserve the structure each scaffold emitted; only
credentials, tenant endpoints and machine-local paths are redacted.
