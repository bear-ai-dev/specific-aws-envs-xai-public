# Fresh eight-run Bedrock cohort analysis

## Contents

- [Selection result](#selection-result)
- [Observed model difference](#observed-model-difference)
- [Trial evidence](#trial-evidence)
- [Failure mode analysis](#failure-mode-analysis)
- [Fairness and reachability](#fairness-and-reachability)
- [Evidence boundary](#evidence-boundary)

## Selection result

One of the three freshly evaluated tasks meets the numerical Grok calibration
screen: Grok solves one to six attempts out of eight, or Grok solves zero while
the comparison model solves the same frozen task.

| Screened task | Grok 4.6 | Opus 5 | Result |
| --- | ---: | ---: | --- |
| Tenant attribution | 8/8 | 8/8 | Outside band: too easy for both models |
| Entitlement overage lines | 0/8 | 8/8 | Selected: comparator-reachable Grok full failure |
| Usage-window aggregation | 7/8 | 2/8 | Outside band: Grok solve rate exceeds the screen |

Only entitlement overage lines and its 16 model trajectories are included in
this sample. The two out-of-band tasks are not included.

## Observed model difference

The selected task is comparator-reachable: Opus solves all eight attempts under
the same prompt, task image, verifier, harness version, agent version, model
provider, reasoning setting, and eight-attempt denominator where Grok solves
none. This is a measured cohort difference. It establishes reachability but
does not by itself identify the cause of Grok's failures.

## Trial evidence

The [raw cohort](raw/grok-4.6-and-opus-5-eight-rollouts-20260819/) contains all
16 attempts. Folder labels identify the model and number each model's trials by
recorded start time. The original Harbor trial identifier remains available in
each attempt's `config.json` and `result.json`, and in the
[machine-readable trial index](indexes/trials.json).

| Model | Trial | Reward | Trajectory | Verifier report |
| --- | ---: | ---: | --- | --- |
| Grok 4.6 | 1 | 0.0 | [Trace](raw/grok-4.6-and-opus-5-eight-rollouts-20260819/grok-4.6-trial-01/agent/mini-swe-agent.txt) | [Report](raw/grok-4.6-and-opus-5-eight-rollouts-20260819/grok-4.6-trial-01/verifier/report.txt) |
| Opus 5 | 1 | 1.0 | [Trace](raw/grok-4.6-and-opus-5-eight-rollouts-20260819/opus-5-trial-01/agent/mini-swe-agent.txt) | [Report](raw/grok-4.6-and-opus-5-eight-rollouts-20260819/opus-5-trial-01/verifier/report.txt) |
| Grok 4.6 | 2 | 0.0 | [Trace](raw/grok-4.6-and-opus-5-eight-rollouts-20260819/grok-4.6-trial-02/agent/mini-swe-agent.txt) | [Report](raw/grok-4.6-and-opus-5-eight-rollouts-20260819/grok-4.6-trial-02/verifier/report.txt) |
| Opus 5 | 2 | 1.0 | [Trace](raw/grok-4.6-and-opus-5-eight-rollouts-20260819/opus-5-trial-02/agent/mini-swe-agent.txt) | [Report](raw/grok-4.6-and-opus-5-eight-rollouts-20260819/opus-5-trial-02/verifier/report.txt) |
| Grok 4.6 | 3 | 0.0 | [Trace](raw/grok-4.6-and-opus-5-eight-rollouts-20260819/grok-4.6-trial-03/agent/mini-swe-agent.txt) | [Report](raw/grok-4.6-and-opus-5-eight-rollouts-20260819/grok-4.6-trial-03/verifier/report.txt) |
| Opus 5 | 3 | 1.0 | [Trace](raw/grok-4.6-and-opus-5-eight-rollouts-20260819/opus-5-trial-03/agent/mini-swe-agent.txt) | [Report](raw/grok-4.6-and-opus-5-eight-rollouts-20260819/opus-5-trial-03/verifier/report.txt) |
| Grok 4.6 | 4 | 0.0 | [Trace](raw/grok-4.6-and-opus-5-eight-rollouts-20260819/grok-4.6-trial-04/agent/mini-swe-agent.txt) | [Report](raw/grok-4.6-and-opus-5-eight-rollouts-20260819/grok-4.6-trial-04/verifier/report.txt) |
| Opus 5 | 4 | 1.0 | [Trace](raw/grok-4.6-and-opus-5-eight-rollouts-20260819/opus-5-trial-04/agent/mini-swe-agent.txt) | [Report](raw/grok-4.6-and-opus-5-eight-rollouts-20260819/opus-5-trial-04/verifier/report.txt) |
| Grok 4.6 | 5 | 0.0 | [Trace](raw/grok-4.6-and-opus-5-eight-rollouts-20260819/grok-4.6-trial-05/agent/mini-swe-agent.txt) | [Report](raw/grok-4.6-and-opus-5-eight-rollouts-20260819/grok-4.6-trial-05/verifier/report.txt) |
| Opus 5 | 5 | 1.0 | [Trace](raw/grok-4.6-and-opus-5-eight-rollouts-20260819/opus-5-trial-05/agent/mini-swe-agent.txt) | [Report](raw/grok-4.6-and-opus-5-eight-rollouts-20260819/opus-5-trial-05/verifier/report.txt) |
| Grok 4.6 | 6 | 0.0 | [Trace](raw/grok-4.6-and-opus-5-eight-rollouts-20260819/grok-4.6-trial-06/agent/mini-swe-agent.txt) | [Report](raw/grok-4.6-and-opus-5-eight-rollouts-20260819/grok-4.6-trial-06/verifier/report.txt) |
| Opus 5 | 6 | 1.0 | [Trace](raw/grok-4.6-and-opus-5-eight-rollouts-20260819/opus-5-trial-06/agent/mini-swe-agent.txt) | [Report](raw/grok-4.6-and-opus-5-eight-rollouts-20260819/opus-5-trial-06/verifier/report.txt) |
| Grok 4.6 | 7 | 0.0 | [Trace](raw/grok-4.6-and-opus-5-eight-rollouts-20260819/grok-4.6-trial-07/agent/mini-swe-agent.txt) | [Report](raw/grok-4.6-and-opus-5-eight-rollouts-20260819/grok-4.6-trial-07/verifier/report.txt) |
| Opus 5 | 7 | 1.0 | [Trace](raw/grok-4.6-and-opus-5-eight-rollouts-20260819/opus-5-trial-07/agent/mini-swe-agent.txt) | [Report](raw/grok-4.6-and-opus-5-eight-rollouts-20260819/opus-5-trial-07/verifier/report.txt) |
| Grok 4.6 | 8 | 0.0 | [Trace](raw/grok-4.6-and-opus-5-eight-rollouts-20260819/grok-4.6-trial-08/agent/mini-swe-agent.txt) | [Report](raw/grok-4.6-and-opus-5-eight-rollouts-20260819/grok-4.6-trial-08/verifier/report.txt) |
| Opus 5 | 8 | 1.0 | [Trace](raw/grok-4.6-and-opus-5-eight-rollouts-20260819/opus-5-trial-08/agent/mini-swe-agent.txt) | [Report](raw/grok-4.6-and-opus-5-eight-rollouts-20260819/opus-5-trial-08/verifier/report.txt) |

## Failure mode analysis

### Business-logic gap: chargeability and invoice visibility were collapsed

The [task instruction](../tasks/02-entitlement-overage-lines/instruction.md)
defines two separate decisions for each dimension:

1. **Chargeability:** calculate the quantity the customer owes for after
   applying allowances and overage rules.
2. **Invoice visibility:** if the dimension is priced at zero, include its line
   unless the invoice settings explicitly hide free dimensions. The line stays
   visible even when the calculated quantity is zero.

All eight Grok submissions found the relevant invoice-line code and calculated
the allowance and overage quantities correctly. They then made positive owed
quantity a prerequisite for every line. One representative final implementation
contains this gate:

```ts
if (!Number.isFinite(owedQuantity) || owedQuantity <= 0) {
    return false;
}
if (unitCost === 0 && settings?.freeDimensionOnInvoice === FreeDimensionOnInvoice.hide) {
    return false;
}
return true;
```

[Representative Grok final deliverable](raw/grok-4.6-and-opus-5-eight-rollouts-20260819/grok-4.6-trial-01/verifier/deliverable/offering/entities/offeringPackage.entity.ts)

This ordering means the free-dimension setting is never considered when the
quantity owed is zero. Grok Trial 7 made the same interpretation explicit in an
ad hoc assertion:

```ts
assert(
    Offering.shouldIncludeDimensionLine({
        quantity: 0,
        unitCost: 0,
        settings: { freeDimensionOnInvoice: FreeDimensionOnInvoice.show } as any,
    }) === false,
    'zero free quantity hidden even when show',
);
```

[Grok Trial 7 trajectory containing the assertion](raw/grok-4.6-and-opus-5-eight-rollouts-20260819/grok-4.6-trial-07/agent/mini-swe-agent.txt)

The solving Opus submissions kept the two decisions separate. A representative
implementation first handles a zero-priced dimension according to the invoice
setting, and applies the positive-quantity test only to dimensions with a
non-zero price:

```ts
if (isFreeDimension) {
    if (hideFreeDimensions) {
        return;
    }
} else if (!(owed > 0)) {
    return;
}
```

[Representative Opus final deliverable](raw/grok-4.6-and-opus-5-eight-rollouts-20260819/opus-5-trial-05/verifier/deliverable/offering/entities/offeringPackage.entity.ts)

The behavioral consequence was identical in all eight Grok trials. Each
submission produced otherwise valid invoice results but omitted five required
zero-priced, zero-quantity lines across four customers in the `solstice-july`
run:

- `solstice-model-invocations` for `cus_cobalt` and `cus_vesper`;
- `solstice-retention-days` for `cus_dunmore` and `cus_juniper`; and
- `solstice-bandwidth-gigabytes` for `cus_juniper`.

[Representative Grok verifier report](raw/grok-4.6-and-opus-5-eight-rollouts-20260819/grok-4.6-trial-01/verifier/report.txt)

This supports a narrow gap in translating multi-part business rules into a
complete decision table. The useful training target is to enumerate the
cross-product of price (`zero` or `non-zero`), owed quantity (`zero` or
positive), and invoice setting (`show` or `hide`) before implementing or testing
the branch logic.

| Training gap | Evidence score | Decision | Evidence | Training target |
| --- | ---: | --- | --- | --- |
| Separate chargeability from statement visibility | 100/100 | Retain | Explicit requirement; identical missing-line consequence in 8/8 valid Grok trials; matched Opus solves in 8/8 trials; no infrastructure exceptions | Build and test the complete business-rule decision table before coding |

## Fairness and reachability

The instruction tells the agent that a local AWS-compatible endpoint is
available through the preconfigured `AWS_ENDPOINT_URL`. The task image supplies
the endpoint's credentials and region. The Bedrock adapter keeps provider
credentials separate from those task-local credentials and verifies the local
endpoint through the repository's normal AWS SDK path before the first model
request.

All 16 packaged model trials have a numeric verifier reward, complete
trajectory, complete verifier artifact, and no Harbor exception. The matching
oracle control scores `1.0`, and the matching no-op control scores `0.0`.

## Evidence boundary

The conclusion is limited to the stored prompt, frozen task, trajectories,
verifier outcomes, and controls. The package reports one observed model gap; it
does not claim that one eight-run cohort proves a general model ranking.

Organization identifiers were normalized consistently across the public task
and recorded evidence. The task requirements, numeric fixtures, model outputs,
rewards, recorded trial identifiers, and chronological ordering were not
changed. The public task's oracle and no-op controls were rerun after
normalization.
