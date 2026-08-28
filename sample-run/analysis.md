# Highlighted matched-cohort analysis

## Contents

- [Cohort result](#cohort-result)
- [Observed model difference](#observed-model-difference)
- [Trial evidence](#trial-evidence)
- [Failure mode analysis](#failure-mode-analysis)
- [Fairness and reachability](#fairness-and-reachability)
- [Evidence boundary](#evidence-boundary)

## Cohort result

This document analyzes four highlighted tasks from the eleven-task public
sample, with eight Grok 4.6 trials and eight Opus 5 trials per task. The full
eleven-task result is in the [pass-rate matrix](indexes/pass-rate-matrix.md).
Tasks 1, 2, and 3 use one Daytona runtime
stratum. Task 4 pools one matched four-run Daytona stratum and one
separately matched four-run AWS Fargate stratum.

| Task | Model | Solves | Interpretation |
| --- | --- | ---: | --- |
| [Task 1: entitlement overage lines](../tasks/01-entitlement-overage-lines/instruction.md) | Grok 4.6 | 0/8 | Comparator-reachable full failure |
| [Task 1: entitlement overage lines](../tasks/01-entitlement-overage-lines/instruction.md) | Opus 5 | 8/8 | Solving comparator |
| [Task 2: multi-region sweep](../tasks/02-multi-region-sweep/instruction.md) | Grok 4.6 | 6/8 | Solves, with two cross-workflow omissions |
| [Task 2: multi-region sweep](../tasks/02-multi-region-sweep/instruction.md) | Opus 5 | 8/8 | Consistent solving comparator |
| [Task 3: IAM role validation](../tasks/03-iam-role-validation/instruction.md) | Grok 4.6 | 3/8 | Solves, with five optional-state omissions |
| [Task 3: IAM role validation](../tasks/03-iam-role-validation/instruction.md) | Opus 5 | 8/8 | Consistent solving comparator |
| [Task 4: tax jurisdiction](../tasks/04-tax-jurisdiction/instruction.md) | Grok 4.6 | 0/8 | Full failure in both runtime strata |
| [Task 4: tax jurisdiction](../tasks/04-tax-jurisdiction/instruction.md) | Opus 5 | 5/8 | 4/4 Daytona and 1/4 Fargate |

Task 4 adds a full-failure example with comparator solves in both runtime
strata. Tasks 2 and 3 provide within-Grok counterexamples showing
that the required behavior is reachable but less consistent. Task 1 remains
the strongest single-stratum full-failure example.

## Observed model difference

The four highlighted tasks were run with the same harness version, agent version, provider,
reasoning setting, and task-specific verifier. Models are matched within every
recorded runtime-checksum stratum. Every admitted trial has a numeric reward,
native trajectory, complete verifier evidence, and no Harbor exception.

The evidence does not say Grok lacks the underlying AWS capabilities. Solving
Grok runs exist for Tasks 2 and 3 and contain the exact behavior required by
the verifier. The measured difference is how consistently the model carries a
multi-part contract across sibling code paths and boundary states.

## Trial evidence

The [machine-readable index](indexes/trials.json) resolves all 176 admitted
trials to their trajectories and verifier results. The table below covers the
64 trials analyzed in this document.

| Task | Full trajectories | Final code and touched files | Verifier evidence | Controls |
| --- | --- | --- | --- | --- |
| Task 1 | [8 Grok and 8 Opus](raw/grok-4.6-and-opus-5-eight-rollouts-20260819/) | [Grok review files](review-bundle/01-entitlement-overage-lines/) | Full Harbor result trees in the raw cohort | [Oracle and no-op](raw/xai-public-controls-20260819/) |
| Task 2 | [8 Grok](review-bundle/02-multi-region-sweep/trajectories/grok/) and [8 Opus](review-bundle/02-multi-region-sweep/trajectories/opus/) | [Task 2 review files](review-bundle/02-multi-region-sweep/) | [Per-trial reports, observations, rewards, and stdout](review-bundle/02-multi-region-sweep/verification-results/) | [Oracle and no-op](review-bundle/02-multi-region-sweep/controls/) |
| Task 3 | [8 Grok](review-bundle/03-iam-role-validation/trajectories/grok/) and [8 Opus](review-bundle/03-iam-role-validation/trajectories/opus/) | [Task 3 review files](review-bundle/03-iam-role-validation/) | [Per-trial reports, observations, rewards, and stdout](review-bundle/03-iam-role-validation/verification-results/) | [Oracle and no-op](review-bundle/03-iam-role-validation/controls/) |
| Task 4 | [8 Grok](review-bundle/04-tax-jurisdiction/trajectories/grok/) and [8 Opus](review-bundle/04-tax-jurisdiction/trajectories/opus/) | [Task 4 review files](review-bundle/04-tax-jurisdiction/) | [Per-trial reports, observations, rewards, and stdout](review-bundle/04-tax-jurisdiction/verification-results/) | [Daytona oracle and no-op](review-bundle/04-tax-jurisdiction/controls/) |

## Failure mode analysis

### Task 1: chargeability and invoice visibility were collapsed

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

### Task 2: the contract reached volumes but not snapshots

The task requires block-storage inventory across every enabled region, keeping
readable empty regions, excluding permanently unreadable regions, retrying
transient throttles, and preserving pagination.

The two failing Grok submissions implemented those behaviors for
`getAllVolumes` but left `getAllSnapshots` on its original single-region path.
Their tests also exercised only the volume function. Both failures therefore
missed the same five enabled snapshot regions.

[Failed Grok Trial 1](review-bundle/02-multi-region-sweep/trajectories/grok/trial-01.json)
and
[its verifier report](review-bundle/02-multi-region-sweep/verification-results/grok/trial-01/report.txt)

The six solving Grok submissions intentionally route both functions through
the same region-sweep behavior. A representative solving change introduces a
shared collector used by `getAllVolumes` and `getAllSnapshots`.

[Solving Grok Trial 2 code](review-bundle/02-multi-region-sweep/grok-solution/trial-02/awsEc2.ts)
and
[paired Opus Trial 1](review-bundle/02-multi-region-sweep/trajectories/opus/trial-01.json)

This is evidence of cross-workflow completion reliability, not accidental
verifier luck or missing EC2 knowledge.

### Task 3: absent and invalid optional configuration were collapsed

The endpoint must validate a supplied scraper role by assuming it and proving
the resulting session can call `DescribeInstances`. A failed validation is a
bad request with no write. A blank role disconnects and clears the external ID.
An update with no cloud block must leave cloud configuration alone.

Five Grok submissions correctly implemented role assumption, external-ID
handling, permission validation, bad-request behavior, atomicity, and blank
disconnect. They failed only the request carrying no cloud block. Their
property-existence check saw `cloudIAM` as an own DTO property whose value was
`undefined`, then treated it as an invalid present block.

[Failed Grok Trial 1](review-bundle/03-iam-role-validation/trajectories/grok/trial-01.json)
and
[its verifier report](review-bundle/03-iam-role-validation/verification-results/grok/trial-01/report.txt)

The three solving Grok submissions test the value before validating and retain
the existing setting when it is absent. All eight Opus submissions make the
same state distinction, though their implementations vary.

[Solving Grok Trial 6 code](review-bundle/03-iam-role-validation/grok-solution/trial-06/settings.service.ts)
and
[paired Opus Trial 1](review-bundle/03-iam-role-validation/trajectories/opus/trial-01.json)

This supports a narrow gap in optional nested-configuration state completeness.

### Task 4: exact authority semantics were only partially carried through

All eight Grok submissions implemented meaningful parts of tax determination,
but each missed at least one required interaction among authority routing,
rounding, address refusal, filing eligibility, and VAT presentation. All four
Daytona Opus runs and one Fargate Opus run completed the full verifier contract.

[Task 4 Grok Trial 1](review-bundle/04-tax-jurisdiction/trajectories/grok/trial-01.json)
and
[paired Opus Trial 1](review-bundle/04-tax-jurisdiction/trajectories/opus/trial-01.json)

## Fairness and reachability

Every instruction states that a local AWS-compatible endpoint is available
through `AWS_ENDPOINT_URL`, with credentials and region already in the shell.
The task images keep those task-local credentials separate from Bedrock
provider credentials. The models may inspect public sandbox resources while
developing, but held-out data and independent scoring remain root-only.

Every published task has an oracle score of `1.0` and a no-op score of `0.0`
under the task identity recorded in the public control manifest. Recorded-build
coverage is narrower for these four highlighted tasks: Task 1's stored control
predates its scored build, Task 4 has a control for its Daytona stratum only,
and Tasks 2 and 3 are fully covered. The runnable
public tasks apply deterministic publication normalization to names, domains,
example account identifiers, and task-local fake credentials. One MIT-licensed
runtime dependency is vendored unchanged under a neutral package scope so clean
installs do not depend on the source organization. Requirements,
model-generated control flow, trial order, verifier outcomes, and binary
rewards are unchanged.

The four highlighted normalized task directories were separately rerun through
Harbor in Docker. Their four oracle trials scored `1.0`, their four no-op trials
scored `0.0`, and none raised an exception. Tasks 5 to 11 carry recorded-build
controls with the same binary outcomes. Task identities and trial IDs are in the
[`public control manifest`](manifests/public-controls-validation.json).

## Evidence boundary

The conclusions are limited to the stored prompts, recorded runtime-checksum
strata, trajectories, verifier outcomes, and controls. These four highlighted tasks
do not establish a universal model ranking. The 0/8 versus 5/8 total for Task
27 is a pooled descriptive count across two equal backend strata; the matched
comparison is preserved within each stratum. Tasks 2 and 3 show a
reliability difference because Grok sometimes produces the complete solution.
