# Matched Bedrock cohort analysis

## Contents

- [Cohort result](#cohort-result)
- [Observed model difference](#observed-model-difference)
- [Trial evidence](#trial-evidence)
- [Failure mode analysis](#failure-mode-analysis)
- [Fairness and reachability](#fairness-and-reachability)
- [Evidence boundary](#evidence-boundary)

## Cohort result

This sample evaluates five tasks with eight Grok 4.6 trials and eight Opus 5
trials per task. Tasks 2, 7, and 14 use one Daytona runtime stratum. Tasks 27
and 31 pool one matched four-run Daytona stratum and one separately matched
four-run AWS Fargate stratum.

| Task | Model | Solves | Interpretation |
| --- | --- | ---: | --- |
| [Task 2: entitlement overage lines](../tasks/02-entitlement-overage-lines/instruction.md) | Grok 4.6 | 0/8 | Comparator-reachable full failure |
| [Task 2: entitlement overage lines](../tasks/02-entitlement-overage-lines/instruction.md) | Opus 5 | 8/8 | Solving comparator |
| [Task 7: multi-region sweep](../tasks/07-multi-region-sweep/instruction.md) | Grok 4.6 | 6/8 | Solves, with two cross-workflow omissions |
| [Task 7: multi-region sweep](../tasks/07-multi-region-sweep/instruction.md) | Opus 5 | 8/8 | Consistent solving comparator |
| [Task 14: IAM role validation](../tasks/14-iam-role-validation/instruction.md) | Grok 4.6 | 3/8 | Solves, with five optional-state omissions |
| [Task 14: IAM role validation](../tasks/14-iam-role-validation/instruction.md) | Opus 5 | 8/8 | Consistent solving comparator |
| [Task 27: tax jurisdiction](../tasks/27-tax-jurisdiction/instruction.md) | Grok 4.6 | 0/8 | Full failure in both runtime strata |
| [Task 27: tax jurisdiction](../tasks/27-tax-jurisdiction/instruction.md) | Opus 5 | 5/8 | 4/4 Daytona and 1/4 Fargate |
| [Task 31: customer onboarding](../tasks/31-customer-onboarding/instruction.md) | Grok 4.6 | 0/8 | Full failure in both runtime strata |
| [Task 31: customer onboarding](../tasks/31-customer-onboarding/instruction.md) | Opus 5 | 5/8 | 3/4 Daytona and 2/4 Fargate |

Tasks 27 and 31 add full-failure examples with comparator solves in both
runtime strata. Tasks 7 and 14 provide within-Grok counterexamples showing
that the required behavior is reachable but less consistent. Task 2 remains
the strongest single-stratum full-failure example.

## Observed model difference

The five tasks were run with the same harness version, agent version, provider,
reasoning setting, and task-specific verifier. Models are matched within every
recorded runtime-checksum stratum. Every admitted trial has a numeric reward,
native trajectory, complete verifier evidence, and no Harbor exception.

The evidence does not say Grok lacks the underlying AWS capabilities. Solving
Grok runs exist for Tasks 7 and 14 and contain the exact behavior required by
the verifier. The measured difference is how consistently the model carries a
multi-part contract across sibling code paths and boundary states.

## Trial evidence

The [machine-readable index](indexes/trials.json) resolves all 80 admitted
trials to their trajectories and verifier results.

| Task | Full trajectories | Final code and touched files | Verifier evidence | Controls |
| --- | --- | --- | --- | --- |
| Task 2 | [8 Grok and 8 Opus](raw/grok-4.6-and-opus-5-eight-rollouts-20260819/) | [Grok review files](review-bundle/) | Full Harbor result trees in the raw cohort | [Oracle and no-op](raw/xai-public-controls-20260819/) |
| Task 7 | [8 Grok](review-bundle/07-multi-region-sweep/trajectories/grok/) and [8 Opus](review-bundle/07-multi-region-sweep/trajectories/opus/) | [Task 7 review files](review-bundle/07-multi-region-sweep/) | [Per-trial reports, observations, rewards, and stdout](review-bundle/07-multi-region-sweep/verification-results/) | [Oracle and no-op](review-bundle/07-multi-region-sweep/controls/) |
| Task 14 | [8 Grok](review-bundle/14-iam-role-validation/trajectories/grok/) and [8 Opus](review-bundle/14-iam-role-validation/trajectories/opus/) | [Task 14 review files](review-bundle/14-iam-role-validation/) | [Per-trial reports, observations, rewards, and stdout](review-bundle/14-iam-role-validation/verification-results/) | [Oracle and no-op](review-bundle/14-iam-role-validation/controls/) |
| Task 27 | [8 Grok](review-bundle/27-tax-jurisdiction/trajectories/grok/) and [8 Opus](review-bundle/27-tax-jurisdiction/trajectories/opus/) | [Task 27 review files](review-bundle/27-tax-jurisdiction/) | [Per-trial reports, observations, rewards, and stdout](review-bundle/27-tax-jurisdiction/verification-results/) | [Daytona oracle and no-op](review-bundle/27-tax-jurisdiction/controls/) |
| Task 31 | [8 Grok](review-bundle/31-customer-onboarding/trajectories/grok/) and [8 Opus](review-bundle/31-customer-onboarding/trajectories/opus/) | [Task 31 review files](review-bundle/31-customer-onboarding/) | [Per-trial reports, observations, rewards, and stdout](review-bundle/31-customer-onboarding/verification-results/) | [Daytona oracle and no-op](review-bundle/31-customer-onboarding/controls/) |

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

### Task 27: exact authority semantics were only partially carried through

All eight Grok submissions implemented meaningful parts of tax determination,
but each missed at least one required interaction among authority routing,
rounding, address refusal, filing eligibility, and VAT presentation. All four
Daytona Opus runs and one Fargate Opus run completed the full verifier contract.

[Task 27 Grok Trial 1](review-bundle/27-tax-jurisdiction/trajectories/grok/trial-01.json)
and
[paired Opus Trial 1](review-bundle/27-tax-jurisdiction/trajectories/opus/trial-01.json)

### Task 31: settings context was dropped at a collaborator boundary

All eight Grok submissions built most of the onboarding workflow but failed to
forward the already-read business settings into contract creation. The
verifier therefore observed missing settings context at the contract
collaborator. Three Daytona and two Fargate Opus runs preserved that handoff.

[Task 31 Grok Trial 1](review-bundle/31-customer-onboarding/trajectories/grok/trial-01.json)
and
[paired Opus Trial 1](review-bundle/31-customer-onboarding/trajectories/opus/trial-01.json)

## Fairness and reachability

Every instruction states that a local AWS-compatible endpoint is available
through `AWS_ENDPOINT_URL`, with credentials and region already in the shell.
The task images keep those task-local credentials separate from Bedrock
provider credentials. The models may inspect public sandbox resources while
developing, but held-out data and independent scoring remain root-only.

For every task, the matching recorded control scores `1.0` for the oracle and
`0.0` for the no-op. The runnable public tasks apply deterministic publication
normalization to names, domains, example account identifiers, and task-local
fake credentials. One MIT-licensed runtime dependency is vendored unchanged
under a neutral package scope so clean installs do not depend on the source
organization. Requirements, model-generated control flow, trial order,
verifier outcomes, and binary rewards are unchanged.

All five normalized public task directories were separately rerun through
Harbor in Docker. The five oracle trials scored `1.0`, the five no-op trials
scored `0.0`, and none raised an exception; the task digests and trial IDs are
in the
[`public control manifest`](manifests/public-controls-validation.json).

## Evidence boundary

The conclusions are limited to the stored prompts, recorded runtime-checksum
strata, trajectories, verifier outcomes, and controls. These five task samples
do not establish a universal model ranking. The 0/8 versus 5/8 totals for Tasks
27 and 31 are pooled descriptive counts across two equal backend strata; the
matched comparison is preserved within each stratum. Tasks 7 and 14 show a
reliability difference because Grok sometimes produces the complete solution.
