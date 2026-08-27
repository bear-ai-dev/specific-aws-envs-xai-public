# Sample RL Tasks for AWS - xAI

This sample contains the eleven tasks analyzed in the accompanying report.
Tasks 1, 2 and 3 use one eight-run Daytona cohort whose checksum both models
share. Task 4 uses two matched four-run backend strata. Tasks 5 to 7 use one
eight-run cohort per model arm. On Tasks 8 to 11, Grok has one eight-run
mini-SWE-agent stratum while Opus has separate four-run opencode and
mini-SWE-agent strata against the same task checksum.

Every task carries both model arms. Grok 4.6 solved 0/8, 6/8, 3/8, 0/8, 3/8,
0/8, 5/8, 2/8, 0/8, 6/8 and 0/8. Claude Opus 5's descriptive totals are 8/8,
8/8, 8/8, 5/8, 8/8, 7/8, 8/8, 7/8, 6/8, 8/8 and 5/8; the last four totals
pool scaffolds only for solve-count inventory, not for pass@k estimation.

Tasks 5 to 7 were built once per model arm, so each arm carries its own recorded
Harbor task checksum and its own stratum. The task packages published here are
byte-identical to the packages the Opus arm ran against, recorded as
`build_equivalence` in
[`frozen-cohort.json`](sample-run/manifests/frozen-cohort.json).

## Contents

- [Pass@k matrix](#passk-matrix)
- [Task inventory](#task-inventory)
- [Failure mode analysis](#failure-mode-analysis)
  - [Missed requirement: charging and printing](#rule-combination-error)
  - [Missed requirement: both inventory sweeps](#incomplete-implementation)
  - [Regression: omitted optional configuration](#mock-only-verification)
  - [Unverified assumptions and wrong logic: tax](#incomplete-authority-semantics)
- [Evidence and controls](#evidence-and-controls)
- [Reproduction](#reproduction)

## Pass@k matrix

`c/n` is the observed solve count within the named runtime/scaffold stratum.
The table uses `pass@k = 1 - C(n-c, k) / C(n, k)`, the estimated chance that at
least one of `k` sampled attempts succeeds. `pass@8` is not reported for a
four-run stratum.
Rows are grouped by model; a blank model cell continues the model named above.
Tasks 1, 2 and 3 are single Daytona cohorts whose checksum both models share.
For Task 4, the eight-attempt rows are pooled descriptive estimates across its
two equal backend strata, not results from one frozen runtime configuration;
the strata themselves are recorded in
[`frozen-cohort.json`](sample-run/manifests/frozen-cohort.json). For Tasks 5 to
7 each arm was built separately, so the two rows of a task come from different
recorded checksums over a byte-identical task package. For Tasks 8 to 11, Opus
attempts 01–04 and 05–08 are shown as separate four-run scaffold strata; their
pooled solve counts above are descriptive only.

<!-- MINI_SWE_MATRIX_START -->
| Model | Task | Solves `c/n` | pass@1 | pass@3 | pass@8 |
| --- | --- | ---: | ---: | ---: | ---: |
| Grok 4.6 | [Task 1](tasks/01-entitlement-overage-lines/instruction.md) | 0/8 | 0.0000 | 0.0000 | 0.0000 |
|  | [Task 2](tasks/02-multi-region-sweep/instruction.md) | 6/8 | 0.7500 | 1.0000 | 1.0000 |
|  | [Task 3](tasks/03-iam-role-validation/instruction.md) | 3/8 | 0.3750 | 0.8214 | 1.0000 |
|  | [Task 4](tasks/04-tax-jurisdiction/instruction.md) | 0/8 | 0.0000 | 0.0000 | 0.0000 |
|  | [Task 5](tasks/05-network-egress-metering/instruction.md) | 3/8 | 0.3750 | 0.8214 | 1.0000 |
|  | [Task 6](tasks/06-api-token-metering/instruction.md) | 0/8 | 0.0000 | 0.0000 | 0.0000 |
|  | [Task 7](tasks/07-api-keys-and-environments/instruction.md) | 5/8 | 0.6250 | 0.9821 | 1.0000 |
|  | [Task 8](tasks/08-dimension-pricing-tiers/instruction.md) | 2/8 | 0.2500 | 0.6429 | 1.0000 |
|  | [Task 9](tasks/09-s3-datastore-measurement/instruction.md) | 0/8 | 0.0000 | 0.0000 | 0.0000 |
|  | [Task 10](tasks/10-customer-identity-migration/instruction.md) | 6/8 | 0.7500 | 1.0000 | 1.0000 |
|  | [Task 11](tasks/11-customer-billing-schedule-migration/instruction.md) | 0/8 | 0.0000 | 0.0000 | 0.0000 |
| Opus 5 | [Task 1](tasks/01-entitlement-overage-lines/instruction.md) | 8/8 | 1.0000 | 1.0000 | 1.0000 |
|  | [Task 2](tasks/02-multi-region-sweep/instruction.md) | 8/8 | 1.0000 | 1.0000 | 1.0000 |
|  | [Task 3](tasks/03-iam-role-validation/instruction.md) | 8/8 | 1.0000 | 1.0000 | 1.0000 |
|  | [Task 4](tasks/04-tax-jurisdiction/instruction.md) | 5/8 | 0.6250 | 0.9821 | 1.0000 |
|  | [Task 5](tasks/05-network-egress-metering/instruction.md) | 8/8 | 1.0000 | 1.0000 | 1.0000 |
|  | [Task 6](tasks/06-api-token-metering/instruction.md) | 7/8 | 0.8750 | 1.0000 | 1.0000 |
|  | [Task 7](tasks/07-api-keys-and-environments/instruction.md) | 8/8 | 1.0000 | 1.0000 | 1.0000 |
| Opus 5 (opencode/1.18.13) | [Task 8](tasks/08-dimension-pricing-tiers/instruction.md) | 4/4 | 1.0000 | 1.0000 | n/a |
|  | [Task 9](tasks/09-s3-datastore-measurement/instruction.md) | 3/4 | 0.7500 | 1.0000 | n/a |
|  | [Task 10](tasks/10-customer-identity-migration/instruction.md) | 4/4 | 1.0000 | 1.0000 | n/a |
|  | [Task 11](tasks/11-customer-billing-schedule-migration/instruction.md) | 3/4 | 0.7500 | 1.0000 | n/a |
| Opus 5 (mini-swe-agent/2.4.5) | [Task 8](tasks/08-dimension-pricing-tiers/instruction.md) | 3/4 | 0.7500 | 1.0000 | n/a |
|  | [Task 9](tasks/09-s3-datastore-measurement/instruction.md) | 3/4 | 0.7500 | 1.0000 | n/a |
|  | [Task 10](tasks/10-customer-identity-migration/instruction.md) | 4/4 | 1.0000 | 1.0000 | n/a |
|  | [Task 11](tasks/11-customer-billing-schedule-migration/instruction.md) | 2/4 | 0.5000 | 1.0000 | n/a |
<!-- MINI_SWE_MATRIX_END -->

## Task inventory

| Task | What was asked |
| --- | --- |
| [Task&nbsp;1](tasks/01-entitlement-overage-lines/instruction.md) | Update invoice generation so customers are charged only for permitted usage above their allowance, while still showing free line items unless the invoice settings hide them. |
| [Task&nbsp;2](tasks/02-multi-region-sweep/instruction.md) | Update block-storage collection to check every enabled AWS region, retry rate limits, keep readable regions even when they are empty, and skip permanently unreadable regions without stopping the whole sweep. |
| [Task&nbsp;3](tasks/03-iam-role-validation/instruction.md) | Validate a customer's IAM role before saving it: assume the role with its external ID, confirm it can read instance inventory, reject the whole update if either check fails, and handle disconnects correctly. |
| [Task&nbsp;4](tasks/04-tax-jurisdiction/instruction.md) | Restore tax determination on issued invoices: choose among destination-priced, manual, and no-tax regimes, let a held exemption override the regime, quote the authority for the buyer's destination on the right account, print VAT identities for European parties, report a refused address without blocking the invoice, and file eligible settled sales. |
| [Task&nbsp;5](tasks/05-network-egress-metering/instruction.md) | Meter outbound network traffic per customer on a five-minute schedule: pick up only the machines tagged for the dimension being billed, total the bytes each one sent out over the interval, add those together per customer, and keep charging for machines that have since stopped. |
| [Task&nbsp;6](tasks/06-api-token-metering/instruction.md) | Meter the platform's own API traffic: record each call against the platform's customer for that tenant at the time of the call, keep calls apart by identity, count a redelivered call once, and roll each window up into one billable figure against the right account and dimension. |
| [Task&nbsp;7](tasks/07-api-keys-and-environments/instruction.md) | Build the console's API key screen across sandbox and production: list the credentials the current account holds in the current environment, rotate one secret without touching the others, retire one so it stops authenticating on the very next request, and refuse any credential the current account does not hold. |
| [Task&nbsp;8](tasks/08-dimension-pricing-tiers/instruction.md) | Add optional volume pricing tiers to usage dimensions: validate and persist them, allocate usage across their bounds, divide quantities by the usage increment, and produce one invoice line per tier consumed. |
| [Task&nbsp;9](tasks/09-s3-datastore-measurement/instruction.md) | Add a datastore-based measurement mode that reads usage from a customer's own S3 bucket: provision a scoped role trusting the customer account, return the ingestion and dead-letter locations, and route valid and malformed records to the right places. |
| [Task&nbsp;10](tasks/10-customer-identity-migration/instruction.md) | Move customers onto a shared offering record: read usage through the customer's offering while honouring time and interval overrides, and refuse to delete an offering that customers still reference. |
| [Task&nbsp;11](tasks/11-customer-billing-schedule-migration/instruction.md) | Finish the per-customer recurring billing migration: create and replace monthly billing schedules with the parameters the billing consumer reads, and drive the existing invoice path with the offering's billing-cycle window. |

Task paths, headings, and review bundles use the same Task 1–4 numbering as the
report. Immutable Harbor trial names and recorded runtime checksums remain in
the machine-readable evidence as provenance.

## Failure mode analysis

<a id="rule-combination-error"></a>

### Task 1: missed requirement in charging and printing

These were eight independent attempts that repeated the same failure mode, not
eight different billing defects. Every Grok submission calculated allowance
and overage quantities, but combined the billing rules in the wrong order by
making positive owed quantity a prerequisite for every invoice line. That let
"nothing is owed" incorrectly remove zero-priced dimensions that the invoice
settings required it to show. All eight Opus submissions kept "what to charge"
separate from "what to show."

Task 1 had no successful Grok runs, so there is no within-Grok success example
for this task. The eight successful Opus runs provide the solving comparison.

A representative failed Grok implementation checks the owed quantity before it
checks whether a free dimension should remain visible:

```ts
if (!Number.isFinite(owedQuantity) || owedQuantity <= 0) {
    return false;
}
if (unitCost === 0 && settings?.freeDimensionOnInvoice === FreeDimensionOnInvoice.hide) {
    return false;
}
return true;
```

A representative Opus implementation keeps the free-dimension visibility
decision separate from the positive-quantity check:

```ts
const owed = Number(dimensionTotals[dimensionId]);
const isFreeDimension = Offering.dimensionIsFree(nonTieredDimensionsMap[dimensionId]);
const hideFreeDimensions =
    offeringInstance?.settings?.freeDimensionOnInvoice === FreeDimensionOnInvoice.hide;
if (isFreeDimension) {
    // A dimension the plan prices at zero is listed for visibility,
    // unless the business asked for free dimensions to be hidden.
    if (hideFreeDimensions) {
        Offering.logger.debug(
            `Dimension ${dimensionId} is free and the business hides free dimensions, skipping its line`,
        );
        return;
    }
} else if (!(owed > 0)) {
    // The customer owes nothing on this dimension, so it gets no line.
    Offering.logger.debug(`Dimension ${dimensionId} has nothing owed on it, skipping its line`);
    return;
}
```

[Failed Grok deliverable](sample-run/raw/grok-4.6-and-opus-5-eight-rollouts-20260819/grok-4.6-trial-01/verifier/deliverable/offering/entities/offeringPackage.entity.ts),
[representative Grok trace](sample-run/raw/grok-4.6-and-opus-5-eight-rollouts-20260819/grok-4.6-trial-07/agent/mini-swe-agent.txt),
and
[paired Opus deliverable](sample-run/raw/grok-4.6-and-opus-5-eight-rollouts-20260819/opus-5-trial-05/verifier/deliverable/offering/entities/offeringPackage.entity.ts)

<a id="incomplete-implementation"></a>

### Task 2: missed requirement in both inventory sweeps

The two failed Grok runs built and tested region discovery, retry handling,
failure isolation, pagination, and empty-region reporting for volumes, then
declared the feature complete without applying it to the neighboring snapshot
workflow. The six solving Grok runs and all eight Opus runs used a shared
region-sweep abstraction for both resource kinds.

A representative failed Grok implementation leaves snapshot collection tied to
one configured region:

```ts
export const getAllSnapshots = async (creds, Filters: Array<Filter> = []): Promise<Record<string, Array<Snapshot>>> => {
    const region = process.env.AWS_REGION || 'us-east-1';
    console.log('Starting get all Snapshots', region);
    const ec2Client = new EC2Client({ credentials: creds, region });
    const snapshots = [];
    let next: string;
    do {
        // Need to do this for pagination
        // eslint-disable-next-line no-await-in-loop
        const response = await ec2Client.send(
            new DescribeSnapshotsCommand({ Filters, OwnerIds: ['self'], NextToken: next }),
        );
        next = response?.NextToken;
        if (response.Snapshots) {
            snapshots.push(...response.Snapshots);
        }
    } while (next);

    return { [region]: snapshots };
};
```

A solving Grok implementation routes both workflows through the same
multi-region collector:

```ts
export const getAllVolumes = async (creds, Filters: Array<Filter> = []): Promise<Record<string, Array<Volume>>> => {
    console.log('Starting get all Volumes');
    return collectByEnabledRegion<Volume>(creds, async (client, next) => {
        const response = await client.send(new DescribeVolumesCommand({ Filters, NextToken: next }));
        return { items: response.Volumes || [], next: response.NextToken };
    });
};

export const getAllSnapshots = async (creds, Filters: Array<Filter> = []): Promise<Record<string, Array<Snapshot>>> => {
    console.log('Starting get all Snapshots');
    return collectByEnabledRegion<Snapshot>(creds, async (client, next) => {
        const response = await client.send(
            new DescribeSnapshotsCommand({ Filters, OwnerIds: ['self'], NextToken: next }),
        );
        return { items: response.Snapshots || [], next: response.NextToken };
    });
};
```

The six successful Grok runs did not repeat the omission: all six applied the
multi-region sweep to both volumes and snapshots, so snapshots were no longer
left on the single configured region.

[Failed Grok code](sample-run/review-bundle/02-multi-region-sweep/grok-solution/trial-01/awsEc2.ts),
[failed Grok trace](sample-run/review-bundle/02-multi-region-sweep/trajectories/grok/trial-01.json),
[solving Grok code](sample-run/review-bundle/02-multi-region-sweep/grok-solution/trial-02/awsEc2.ts),
and
[paired Opus trace](sample-run/review-bundle/02-multi-region-sweep/trajectories/opus/trial-01.json)

<a id="mock-only-verification"></a>

### Task 3: regression from omitted optional configuration

Five Grok runs correctly implemented role assumption, external-ID handling,
instance-inventory permission checks, atomic rejection, and disconnect. Their
focused service tests used simplified objects and did not reproduce the real
HTTP framework's request transformation. On that path, an omitted `cloudIAM`
block appeared as an owned property with value `undefined`; the submissions'
property-existence check therefore collapsed "absent" into "present but
invalid" and rejected an unrelated settings update. The three solving Grok
runs and all eight Opus runs gated validation on an actual value, so the
unrelated update was accepted.

A representative failed Grok implementation checks whether the DTO owns the
property, even when its value is `undefined`:

```ts
if (Object.prototype.hasOwnProperty.call(updatedFileds, 'cloudIAM')) {
    updatedFileds.cloudIAM = await SettingsService.prepareScraperRole(updatedFileds.cloudIAM);
}
```

A solving Grok implementation checks the value instead, preserving the stored
setting when the block was omitted:

```ts
let cloudIAM = updatedFileds.cloudIAM !== undefined ? updatedFileds.cloudIAM : setting.cloudIAM;
if (updatedFileds.cloudIAM !== undefined) {
    cloudIAM = await prepareCloudIamForSave(updatedFileds.cloudIAM);
}
const newEntity = new SettingsEntity({
    ...setting,
    ...updatedFileds,
    pages,
    businessID,
    cloudIAM,
});
```

The three successful Grok runs did not collapse the two states. They validated
`cloudIAM` only when an actual block was supplied and preserved the existing
setting when it was omitted, so an unrelated settings update was not rejected.

[Failed Grok code](sample-run/review-bundle/03-iam-role-validation/grok-solution/trial-01/settings.service.ts),
[failed Grok trace](sample-run/review-bundle/03-iam-role-validation/trajectories/grok/trial-01.json),
[solving Grok code](sample-run/review-bundle/03-iam-role-validation/grok-solution/trial-06/settings.service.ts),
and
[paired Opus trace](sample-run/review-bundle/03-iam-role-validation/trajectories/opus/trial-01.json)

<a id="incomplete-authority-semantics"></a>

### Task 4: unverified assumptions and wrong logic

The report assigns five Grok failures to **Unverified Assumption** and three to
**Wrong Logic**. The first group guessed at least one authority message or sale
eligibility rule instead of checking the recorded month. The second group found
the relevant evidence but still rounded stored tax or put a registration line
in the wrong part of the invoice. These were eight independent attempts at one
tax workflow, not eight different billing defects.

Task 4 had no successful Grok runs, so there is no within-Grok success example
for this task. Five of the eight Opus runs kept the authority's unrounded rate
and tax, used the established VAT wording, reported the refused address, and
filed only the eligible settled sales. The three unsuccessful Opus runs are
also labeled **Unverified Assumption** in the report: they treated a non-US
address with no state as complete and filed two sales that should have been
skipped.

A representative failed Grok implementation rounds the maintained tax before it
is stored:

```ts
if (this.taxCalculationType === TaxCalculationType.manual) {
    const rate = Number(this.taxRate) || 0;
    this.salesTaxRate = rate;
    this.taxAmount = parseFloat((this.totalAmountWithoutTax * rate).toFixed(2));
    return;
}
```

A representative Opus implementation keeps the quoted rate and multiplies
without rounding:

```ts
switch (this.taxCalculationType) {
    case TaxCalculationType.manual:
        this.salesTaxRate = Number(this.taxRate) || 0;
        break;
    case TaxCalculationType.meteringcoCalculated:
        this.salesTaxRate = await this.getTaxRateFromTaxAuthority();
        break;
    default:
        return errors;
}
this.taxAmount = this.totalAmountWithoutTax * this.salesTaxRate;
```

[Failed Grok code](sample-run/review-bundle/04-tax-jurisdiction/grok-solution/trial-01/invoice.entity.ts),
[failed Grok trace](sample-run/review-bundle/04-tax-jurisdiction/trajectories/grok/trial-01.json),
and
[paired Opus trace](sample-run/review-bundle/04-tax-jurisdiction/trajectories/opus/trial-01.json)

## Evidence and controls

- **Harness:** Harbor 0.18.0 with mini-SWE-agent 2.4.5 at high reasoning
  effort. Every task ran in isolated Daytona sandboxes except Task 4, which uses
  separately matched four-run Daytona and AWS Fargate strata. Tasks 5 to 7 carry
  one stratum per model arm. On Tasks 8 to 11 the Opus 5 arm ran attempts 01 to
  04 under opencode 1.18.13 and attempts 05 to 08 under mini-SWE-agent 2.4.5;
  the Grok 4.6 arm is mini-SWE-agent throughout.
- **Routes:** Grok 4.6 used the Bedrock US inference profile. Opus 5 used the
  Bedrock US profile on Tasks 1 to 7 and the global profile on Tasks 8 to 11.
- **Denominator:** All 176 packaged model trials have a numeric reward, complete
  native trajectory and complete verifier evidence. One of them, Task 7 Grok
  trial 8, passed all eight graded rules and was then scored `0.0` because the
  verifier driver lost its connection to the emulator after grading; it is kept
  at its recorded reward rather than dropped.
- **Controls:** Every task has a recorded oracle reward of `1.0` and no-op
  reward of `0.0`. The
  [control inventory](sample-run/manifests/public-controls-validation.json)
  distinguishes the post-normalization Docker rerun for Tasks 1 to 4 from the
  recorded-build Daytona controls for Tasks 5 to 11. The public-tree hashes are
  recorded for comparison; for Tasks 8 to 11 they do not prove that the
  controls were rerun after the public packaging transformation.
  Recorded-build coverage is otherwise narrower, as Appendix A of the report
  states: Task 1's stored control predates its scored build, Task 4 has a
  control for its Daytona stratum only, and Tasks 2 and 3 are fully covered.
- **Task 1 raw evidence:**
  [`sample-run/raw/grok-4.6-and-opus-5-eight-rollouts-20260819/`](sample-run/raw/grok-4.6-and-opus-5-eight-rollouts-20260819/)
  contains all 16 full Harbor attempts.
- **Tasks 2 to 11 evidence:** their complete trajectories, final Grok
  changes, touched files, raw verifier observations, rewards, stdout, held-out
  scoring assets, and controls are in the
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
- **Contract audit:**
  [`tasks-07-11-contract-audit.md`](sample-run/review-bundle/tasks-07-11-contract-audit.md)
  maps the requested behavior to verifier coverage and records the ask-only
  gaps that must not be used as scored capability claims.

## Reproduction

See [HANDOFF.md](HANDOFF.md) for credentials, checksum verification, controls,
cohort execution, evidence redaction, and matrix regeneration.
