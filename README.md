# Sample RL Tasks for AWS - xAI

This sample contains the task that remained inside the selected Grok
calibration band in the fresh eight-run Bedrock cohort. Grok 4.6 solved 0/8
attempts while Claude Opus 5 solved 8/8 on the same frozen task.

## Contents

- [Pass@k matrix](#passk-matrix)
- [Task inventory](#task-inventory)
- [How to interpret the results](#how-to-interpret-the-results)
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
<!-- MINI_SWE_MATRIX_END -->

## Task inventory

| Task | Capability exercised | Role in this sample |
| --- | --- | --- |
| [Task 2](tasks/02-entitlement-overage-lines/instruction.md) | Separate entitlement chargeability from statement visibility | Comparator-reachable Grok full failure |

The source task number is retained in the path and raw records so every result
continues to resolve to the exact frozen task that produced it.

## How to interpret the results

Task 2 is the only observed Grok-specific gap in this sample. The same frozen
task and verifier produced no Grok solves and eight Opus solves. This establishes
reachability and a measured difference in this cohort; it does not by itself
identify the reason for that difference.

See [the full cohort interpretation](sample-run/analysis.md) for the evidence
boundary and validity checks.

## Failure mode analysis

### Business-logic gap: chargeability and invoice visibility were collapsed

The task defines two separate decisions for each dimension:

1. **Chargeability:** calculate the quantity the customer owes for after applying
   allowances and overage rules.
2. **Invoice visibility:** if the dimension is priced at zero, include its line
   unless the invoice settings explicitly hide free dimensions. The line remains
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

[Representative Grok final deliverable](sample-run/raw/grok-4.6-and-opus-5-eight-rollouts-20260819/grok-4.6-trial-01/verifier/deliverable/offering/entities/offeringPackage.entity.ts)

This ordering means the free-dimension setting is never considered when the
quantity owed is zero. One Grok trajectory made the same interpretation explicit
in an ad hoc assertion:

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

[Grok trajectory containing the assertion](sample-run/raw/grok-4.6-and-opus-5-eight-rollouts-20260819/grok-4.6-trial-07/agent/mini-swe-agent.txt)

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

[Representative Opus final deliverable](sample-run/raw/grok-4.6-and-opus-5-eight-rollouts-20260819/opus-5-trial-05/verifier/deliverable/offering/entities/offeringPackage.entity.ts)

The behavioral consequence was identical in all eight Grok trials. Each
submission produced otherwise valid invoice results but omitted five required
zero-priced, zero-quantity lines across four customers in the `solstice-july`
run:

- `solstice-model-invocations` for `cus_cobalt` and `cus_vesper`;
- `solstice-retention-days` for `cus_dunmore` and `cus_juniper`; and
- `solstice-bandwidth-gigabytes` for `cus_juniper`.

[Representative verifier report](sample-run/raw/grok-4.6-and-opus-5-eight-rollouts-20260819/grok-4.6-trial-01/verifier/report.txt)

This supports a narrow gap in translating multi-part business rules into a
complete decision table. The useful training target is to enumerate the
cross-product of price (`zero` or `non-zero`), owed quantity (`zero` or
positive), and invoice setting (`show` or `hide`) before implementing or testing
the branch logic.

The evidence score gives equal weight to requirement knowability, behavioral
verifier validity, repetition, and attribution after infrastructure effects are
excluded.

| Training gap | Evidence score | Decision | Evidence | Training target |
| --- | ---: | --- | --- | --- |
| Separate chargeability from statement visibility | 100/100 | Retain | Explicit requirement; identical missing-line consequence in 8/8 valid Grok trials; matched Opus solves in 8/8 trials; no infrastructure exceptions | Build and test the complete business-rule decision table before coding |

## Evidence and controls

- **Harness:** Harbor 0.18.0 with mini-SWE-agent 2.4.5 in isolated Daytona
  sandboxes at high reasoning effort.
- **Routes:** Grok 4.6 and Claude Opus 5 through Amazon Bedrock. Each model uses
  the same frozen task image and binary verifier.
- **Denominator:** All 16 packaged model trials have a numeric reward, complete
  trajectory, complete verifier artifact, and no Harbor exception.
- **Controls:** The matching oracle run scores `1.0`; the matching no-op run
  scores `0.0`. These controls were rerun after the public identifier
  normalization.
- **Raw evidence:**
  [`sample-run/raw/grok-4.6-and-opus-5-eight-rollouts-20260819/`](sample-run/raw/grok-4.6-and-opus-5-eight-rollouts-20260819/)
  contains all 16 model attempts. Its folders are labeled `grok-4.6-trial-01`
  through `08` and `opus-5-trial-01` through `08`, in chronological order
  within each model. Matching controls are in
  [`sample-run/raw/xai-public-controls-20260819/`](sample-run/raw/xai-public-controls-20260819/).
- **Machine-readable index:**
  [`sample-run/indexes/trials.json`](sample-run/indexes/trials.json) resolves
  every matrix row to its trajectory and verifier result.
- **Reviewer bundle:**
  [`Grok 4.6 review bundle`](sample-run/review-bundle/)
  contains every file Grok directly touched, each Grok trial's final changed
  files, all eight Grok and eight Opus native JSON trajectories, the complete
  verifier execution and scoring assets, and every trial's human-readable
  verification report.
- **Frozen inputs:**
  [`sample-run/manifests/frozen-cohort.json`](sample-run/manifests/frozen-cohort.json)
  records task, harness, and runtime checksums.
- **Publication normalization:**
  [`sample-run/manifests/public-transformation.json`](sample-run/manifests/public-transformation.json)
  records the identifier-only transformation applied consistently to the task
  and captured evidence. Task requirements, numeric fixtures, model outputs,
  verifier rewards, and trial ordering are unchanged.
- **Redaction:**
  [`sample-run/indexes/redaction-manifest.json`](sample-run/indexes/redaction-manifest.json)
  records the credential and local-path scrub applied before publication.

## Reproduction

See [HANDOFF.md](HANDOFF.md) for credentials, checksum verification, controls,
cohort execution, evidence redaction, and matrix regeneration.
