# Sample RL Tasks for AWS - xAI

This sample contains three frozen AWS tasks evaluated in matched eight-run
Bedrock cohorts. Grok 4.6 solved 0/8, 6/8, and 3/8 attempts; Claude Opus 5
solved 8/8 attempts on each corresponding task.

## Contents

- [Pass@k matrix](#passk-matrix)
- [Task inventory](#task-inventory)
- [Failure mode analysis](#failure-mode-analysis)
- [Evidence and controls](#evidence-and-controls)
- [Reproduction](#reproduction)

## Pass@k matrix

Each row contains eight valid Harbor trials. `c/n` is the observed solve count.
The table uses `pass@k = 1 - C(n-c, k) / C(n, k)`, the estimated chance that at
least one of `k` sampled attempts succeeds.

<!-- MINI_SWE_MATRIX_START -->
| Task | Model | Solves `c/n` | pass@1 | pass@3 | pass@8 |
| --- | --- | ---: | ---: | ---: | ---: |
| [Task 2](tasks/02-entitlement-overage-lines/instruction.md) | Grok 4.6 | 0/8 | 0.0000 | 0.0000 | 0.0000 |
| [Task 2](tasks/02-entitlement-overage-lines/instruction.md) | Opus 5 | 8/8 | 1.0000 | 1.0000 | 1.0000 |
| [Task 7](tasks/07-multi-region-sweep/instruction.md) | Grok 4.6 | 6/8 | 0.7500 | 1.0000 | 1.0000 |
| [Task 7](tasks/07-multi-region-sweep/instruction.md) | Opus 5 | 8/8 | 1.0000 | 1.0000 | 1.0000 |
| [Task 14](tasks/14-iam-role-validation/instruction.md) | Grok 4.6 | 3/8 | 0.3750 | 0.8214 | 1.0000 |
| [Task 14](tasks/14-iam-role-validation/instruction.md) | Opus 5 | 8/8 | 1.0000 | 1.0000 | 1.0000 |
<!-- MINI_SWE_MATRIX_END -->

## Task inventory

| Task | Capability exercised | Role in this sample |
| --- | --- | --- |
| [Task 2](tasks/02-entitlement-overage-lines/instruction.md) | Separate entitlement chargeability from statement visibility | Comparator-reachable Grok full failure |
| [Task 7](tasks/07-multi-region-sweep/instruction.md) | Apply one region-coverage contract to every sibling inventory workflow | Secondary Grok reliability gap |
| [Task 14](tasks/14-iam-role-validation/instruction.md) | Separate absent, invalid, and disconnect states while validating cloud access atomically | Primary Grok reliability gap |

The source task numbers are retained in task paths, headings, review bundles,
and recorded trial names so every result resolves to the exact frozen task that
produced it.

## Failure mode analysis

### Task 2: chargeability and invoice visibility were collapsed

All eight Grok submissions calculated allowance and overage quantities, then
made positive owed quantity a prerequisite for every invoice line. That drops
zero-priced dimensions even when invoice settings say to show them. All eight
Opus submissions kept chargeability and visibility separate.

[Task 2 representative Grok trace](sample-run/raw/grok-4.6-and-opus-5-eight-rollouts-20260819/grok-4.6-trial-07/agent/mini-swe-agent.txt)
and
[paired Opus deliverable](sample-run/raw/grok-4.6-and-opus-5-eight-rollouts-20260819/opus-5-trial-05/verifier/deliverable/offering/entities/offeringPackage.entity.ts)

### Task 7: one sibling inventory workflow was left behind

The two failed Grok runs implemented region discovery, retry handling, failure
isolation, pagination, and empty-region reporting for volumes, but left
snapshots on the original single-region path. The six solving Grok runs and all
eight Opus runs used a shared region-sweep abstraction for both resource kinds.

[Task 7 failed Grok trace](sample-run/review-bundle/07-multi-region-sweep/trajectories/grok/trial-01.json),
[solving Grok change](sample-run/review-bundle/07-multi-region-sweep/grok-solution/trial-02/awsEc2.ts),
and
[paired Opus trace](sample-run/review-bundle/07-multi-region-sweep/trajectories/opus/trial-01.json)

### Task 14: an omitted optional block was treated as invalid

Five Grok runs correctly implemented role assumption, external-ID handling,
instance-inventory permission checks, atomic rejection, and disconnect. They
still rejected an ordinary settings update carrying no `cloudIAM` block. Their
property-existence check observed the transformed DTO's own `cloudIAM` property
with value `undefined`, collapsing "absent" into "present but invalid." The
three solving Grok runs and all eight Opus runs gated validation on an actual
value and preserved the existing setting when the block was absent.

[Task 14 failed Grok trace](sample-run/review-bundle/14-iam-role-validation/trajectories/grok/trial-01.json),
[solving Grok change](sample-run/review-bundle/14-iam-role-validation/grok-solution/trial-06/settings.service.ts),
and
[paired Opus trace](sample-run/review-bundle/14-iam-role-validation/trajectories/opus/trial-01.json)

## Evidence and controls

- **Harness:** Harbor 0.18.0 with mini-SWE-agent 2.4.5 in isolated Daytona
  sandboxes at high reasoning effort.
- **Routes:** Grok 4.6 and Claude Opus 5 through Amazon Bedrock.
- **Denominator:** All 48 packaged model trials have a numeric reward, complete
  native trajectory, complete verifier evidence, and no Harbor exception.
- **Controls:** Every task has an oracle reward of `1.0` and a no-op reward of
  `0.0`. Recorded-runtime controls are included with the review bundles. A
  separate [post-normalization control manifest](sample-run/manifests/public-controls-validation.json)
  records a clean six-trial Docker rerun on the runnable public tasks.
- **Task 2 raw evidence:**
  [`sample-run/raw/grok-4.6-and-opus-5-eight-rollouts-20260819/`](sample-run/raw/grok-4.6-and-opus-5-eight-rollouts-20260819/)
  contains all 16 full Harbor attempts.
- **Tasks 7 and 14 evidence:** their complete trajectories, final Grok changes,
  touched files, raw verifier observations, rewards, stdout, held-out scoring
  assets, and controls are in the
  [`review bundle`](sample-run/review-bundle/).
- **Machine-readable index:**
  [`sample-run/indexes/trials.json`](sample-run/indexes/trials.json) resolves
  every matrix cell to its trajectory and verifier result.
- **Frozen inputs:**
  [`sample-run/manifests/frozen-cohort.json`](sample-run/manifests/frozen-cohort.json)
  records task, harness, runtime, and recorded-evidence checksums.
- **Publication normalization:**
  [`sample-run/manifests/public-transformation.json`](sample-run/manifests/public-transformation.json)
  records the identifier-only transformation applied consistently to the tasks
  and captured evidence.

## Reproduction

See [HANDOFF.md](HANDOFF.md) for credentials, checksum verification, controls,
cohort execution, evidence redaction, and matrix regeneration.
