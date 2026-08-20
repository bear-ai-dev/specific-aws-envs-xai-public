# Matched eight-run Bedrock cohort analysis

## Contents

- [Cohort result](#cohort-result)
- [Observed model difference](#observed-model-difference)
- [Trial evidence](#trial-evidence)
- [Failure mode analysis](#failure-mode-analysis)
- [Fairness and reachability](#fairness-and-reachability)
- [Evidence boundary](#evidence-boundary)

## Cohort result

This sample evaluates three frozen tasks with eight Grok 4.6 trials and eight
Opus 5 trials per task.

| Task | Model | Solves | Interpretation |
| --- | --- | ---: | --- |
| [Task 2: entitlement overage lines](../tasks/02-entitlement-overage-lines/instruction.md) | Grok 4.6 | 0/8 | Comparator-reachable full failure |
| [Task 2: entitlement overage lines](../tasks/02-entitlement-overage-lines/instruction.md) | Opus 5 | 8/8 | Solving comparator |
| [Task 7: multi-region sweep](../tasks/07-multi-region-sweep/instruction.md) | Grok 4.6 | 6/8 | Solves, with two cross-workflow omissions |
| [Task 7: multi-region sweep](../tasks/07-multi-region-sweep/instruction.md) | Opus 5 | 8/8 | Consistent solving comparator |
| [Task 14: IAM role validation](../tasks/14-iam-role-validation/instruction.md) | Grok 4.6 | 3/8 | Solves, with five optional-state omissions |
| [Task 14: IAM role validation](../tasks/14-iam-role-validation/instruction.md) | Opus 5 | 8/8 | Consistent solving comparator |

Task 14 is the primary directional result because its 3/8 versus 8/8 split is
large and the five failures share one verifier-backed cause. Task 7 is a
secondary result. Task 2 remains the strongest full-failure example.

## Observed model difference

The three tasks were run with the same harness version, agent version,
provider, reasoning setting, eight-attempt denominator, and task-specific
frozen verifier within each matched cell. Every admitted trial has a numeric
reward, native trajectory, complete verifier evidence, and no Harbor exception.

The evidence does not say Grok lacks the underlying AWS capabilities. Solving
Grok runs exist for Tasks 7 and 14 and contain the exact behavior required by
the verifier. The measured difference is how consistently the model carries a
multi-part contract across sibling code paths and boundary states.

## Trial evidence

The [machine-readable index](indexes/trials.json) resolves all 48 admitted
trials to their trajectories and verifier results.

| Task | Full trajectories | Final code and touched files | Verifier evidence | Controls |
| --- | --- | --- | --- | --- |
| Task 2 | [8 Grok and 8 Opus](raw/grok-4.6-and-opus-5-eight-rollouts-20260819/) | [Grok review files](review-bundle/) | Full Harbor result trees in the raw cohort | [Oracle and no-op](raw/xai-public-controls-20260819/) |
| Task 7 | [8 Grok](review-bundle/07-multi-region-sweep/trajectories/grok/) and [8 Opus](review-bundle/07-multi-region-sweep/trajectories/opus/) | [Task 7 review files](review-bundle/07-multi-region-sweep/) | [Per-trial reports, observations, rewards, and stdout](review-bundle/07-multi-region-sweep/verification-results/) | [Oracle and no-op](review-bundle/07-multi-region-sweep/controls/) |
| Task 14 | [8 Grok](review-bundle/14-iam-role-validation/trajectories/grok/) and [8 Opus](review-bundle/14-iam-role-validation/trajectories/opus/) | [Task 14 review files](review-bundle/14-iam-role-validation/) | [Per-trial reports, observations, rewards, and stdout](review-bundle/14-iam-role-validation/verification-results/) | [Oracle and no-op](review-bundle/14-iam-role-validation/controls/) |

## Failure mode analysis

### Task 2: chargeability and invoice visibility were collapsed

The prompt defines two decisions: how much usage is chargeable after allowances,
and whether a dimension deserves an invoice line. A zero-priced dimension must
follow the invoice visibility setting even when the owed quantity is zero.

All eight Grok submissions calculated allowance and overage quantities, then
required positive owed quantity before considering the free-dimension setting.
A representative implementation contains this ordering:

```ts
if (!Number.isFinite(owedQuantity) || owedQuantity <= 0) {
    return false;
}
if (unitCost === 0 && settings?.freeDimensionOnInvoice === FreeDimensionOnInvoice.hide) {
    return false;
}
return true;
```

[Representative Grok deliverable](raw/grok-4.6-and-opus-5-eight-rollouts-20260819/grok-4.6-trial-01/verifier/deliverable/offering/entities/offeringPackage.entity.ts)

All eight Opus submissions kept the decisions separate. Each Grok trial then
omitted the same five required zero-priced, zero-quantity lines. This supports
a narrow gap in translating a multi-part business rule into a complete decision
table.

### Task 7: the contract reached volumes but not snapshots

The task requires block-storage inventory across every enabled region, keeping
readable empty regions, excluding permanently unreadable regions, retrying
transient throttles, and preserving pagination.

The two failing Grok submissions implemented those behaviors for
`getAllVolumes` but left `getAllSnapshots` on its original single-region path.
Their tests also exercised only the volume function. Both failures therefore
missed the same five enabled snapshot regions.

[Failed Grok Trial 1](review-bundle/07-multi-region-sweep/trajectories/grok/trial-01.json)
and
[its verifier report](review-bundle/07-multi-region-sweep/verification-results/grok/trial-01/report.txt)

The six solving Grok submissions intentionally route both functions through
the same region-sweep behavior. A representative solving change introduces a
shared collector used by `getAllVolumes` and `getAllSnapshots`.

[Solving Grok Trial 2 code](review-bundle/07-multi-region-sweep/grok-solution/trial-02/awsEc2.ts)
and
[paired Opus Trial 1](review-bundle/07-multi-region-sweep/trajectories/opus/trial-01.json)

This is evidence of cross-workflow completion reliability, not accidental
verifier luck or missing EC2 knowledge.

### Task 14: absent and invalid optional configuration were collapsed

The endpoint must validate a supplied scraper role by assuming it and proving
the resulting session can call `DescribeInstances`. A failed validation is a
bad request with no write. A blank role disconnects and clears the external ID.
An update with no cloud block must leave cloud configuration alone.

Five Grok submissions correctly implemented role assumption, external-ID
handling, permission validation, bad-request behavior, atomicity, and blank
disconnect. They failed only the request carrying no cloud block. Their
property-existence check saw `cloudIAM` as an own DTO property whose value was
`undefined`, then treated it as an invalid present block.

[Failed Grok Trial 1](review-bundle/14-iam-role-validation/trajectories/grok/trial-01.json)
and
[its verifier report](review-bundle/14-iam-role-validation/verification-results/grok/trial-01/report.txt)

The three solving Grok submissions test the value before validating and retain
the existing setting when it is absent. All eight Opus submissions make the
same state distinction, though their implementations vary.

[Solving Grok Trial 6 code](review-bundle/14-iam-role-validation/grok-solution/trial-06/settings.service.ts)
and
[paired Opus Trial 1](review-bundle/14-iam-role-validation/trajectories/opus/trial-01.json)

This supports a narrow gap in optional nested-configuration state completeness.

## Fairness and reachability

Every instruction states that a local AWS-compatible endpoint is available
through `AWS_ENDPOINT_URL`, with credentials and region already in the shell.
The task images keep those task-local credentials separate from Bedrock
provider credentials. The models may inspect public sandbox resources while
developing, but held-out data and independent scoring remain root-only.

For every task, the matching oracle scores `1.0` and the no-op scores `0.0` on
the recorded runtime checksum. The runnable public tasks apply deterministic
identifier-only normalization to names, domains, example account identifiers,
and task-local fake credentials. Requirements, model-generated control flow,
trial order, verifier outcomes, and binary rewards are unchanged.

All three normalized public task directories were separately rerun through
Harbor in Docker on 2026-08-20. The three oracle trials scored `1.0`, the three
no-op trials scored `0.0`, and none raised an exception; the task digests and
trial IDs are in the
[`public control manifest`](manifests/public-controls-validation.json).

## Evidence boundary

The conclusions are limited to the stored prompts, frozen task variants,
trajectories, verifier outcomes, and controls. Three eight-run cohorts do not
establish a universal model ranking. Tasks 7 and 14 specifically show a
reliability difference because Grok sometimes produces the complete solution;
Task 2 shows a repeated full failure under this cohort.
