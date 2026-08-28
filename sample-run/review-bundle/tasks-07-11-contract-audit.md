# Tasks 7–11 publication and contract audit

This audit separates two claims that should not be conflated:

1. **Publication evidence QC:** the frozen task packages, recorded model
   trajectories, verifier outputs, rewards, routes, checksums, and control
   stages can be inspected and reproduced from this repository.
2. **Task-contract certification:** every behavioral sentence in an instruction
   is bidirectionally mapped to a deterministic verifier assertion on the exact
   public task tree.

The first claim is supported by the publication validator. The second still has
the ask-only gaps below. Those behaviors must not be used as scored capability
claims unless a new task version closes the verifier gap and its controls and
model cohorts are rerun.

## Recorded cohort identity

| Task | Grok stratum | Opus strata | Descriptive solves |
| --- | --- | --- | ---: |
| 7 — API keys and environments | mini-SWE-agent 2.4.5, 8 runs | mini-SWE-agent 2.4.5, 8 runs | Grok 5/8; Opus 8/8 |
| 8 — dimension pricing tiers | mini-SWE-agent 2.4.5, 8 runs | opencode 1.18.13, 4 runs; mini-SWE-agent 2.4.5, 4 runs | Grok 2/8; Opus 7/8 pooled |
| 9 — S3 datastore measurement | mini-SWE-agent 2.4.5, 8 runs | opencode 1.18.13, 4 runs; mini-SWE-agent 2.4.5, 4 runs | Grok 0/8; Opus 6/8 pooled |
| 10 — customer identity migration | mini-SWE-agent 2.4.5, 8 runs | opencode 1.18.13, 4 runs; mini-SWE-agent 2.4.5, 4 runs | Grok 6/8; Opus 8/8 pooled |
| 11 — customer billing-schedule migration | mini-SWE-agent 2.4.5, 8 runs | opencode 1.18.13, 4 runs; mini-SWE-agent 2.4.5, 4 runs | Grok 0/8; Opus 5/8 pooled |

The Task 8–11 Opus attempts all used
`bedrock/global.anthropic.claude-opus-5`. Their pooled solve totals are useful
only as an evidence inventory. The pass@k matrix keeps the opencode and
mini-SWE-agent four-run strata separate.

## Ask-to-verifier traceability

| Task | Deterministically graded | Ask-only or partial coverage |
| --- | --- | --- |
| 7 | Environment-scoped listing, ownership checks, rotation isolation, immediate retirement, and cross-account refusal | The task README's historical statement that Harbor was not exercised is superseded by the published Harbor trials; it remains in the frozen package so its recorded identity is not silently changed. |
| 8 | Tier validation and persistence, bound allocation, usage-increment division, and per-tier invoice lines | Tier clearing and persistence are exercised at DTO/entity boundaries, not as a complete create/update/read service lifecycle. |
| 9 | S3 measurement provisioning, scoped trust, ingestion/dead-letter locations, valid-record ingestion, and malformed-record routing | Fresh external-ID uniqueness and regression coverage for unchanged API, agent, and infrastructure measurement modes are not independently graded. |
| 10 | Shared-offering persistence, usage reads through the offering, time/interval overrides, and refusal to delete an in-use offering | Customer deletion behavior, full removal of the legacy public service surface, rejection of every legacy service ID/application ID path, Kubernetes path changes, and whole-repository build/regression behavior are not independently graded. |
| 11 | Monthly schedule creation/replacement, consumer parameters, billing-cycle windows, invoice flow, queues, and empty usage | Audit emission when processing fails, prevention of partial billing records, and independently gaining an offering are not fully graded. |

## Controls and transformations

Every task has a recorded oracle reward of `1.0` and no-op reward of `0.0`.
The job-level `stage` in
[`public-controls-validation.json`](../manifests/public-controls-validation.json)
is part of the claim:

- Tasks 1–4 were rerun after publication normalization.
- Tasks 5–11 retain controls from the recorded build.
- For Tasks 8–11, the current public-tree hash is an integrity inventory. It is
  not evidence that oracle/no-op controls were rerun after the task was wrapped
  with its self-contained Dockerfile and vendored workspace.

The Task 8–11 task metadata retains the author attribution present in the
already-public upstream source. It is not a provider credential. Neutralizing
that attribution, changing a frozen instruction, or expanding a verifier would
create a new task hash and therefore requires fresh controls and model runs.

## Publication boundary

The repository publishes the native trajectory representation emitted by each
recorded scaffold plus compact Harbor/verifier evidence. It does not claim a
second normalized trajectory format. The publication validator checks file-set
integrity, task and runtime checksums, model routes, agent-scaffold strata,
required verifier artifacts, reward denominators, links, and basic secret and
local-path patterns.
