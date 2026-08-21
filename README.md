# Sample RL Tasks for AWS - xAI

This sample contains five tasks from the same NestJS billing backend. Tasks 2,
7, and 14 use one matched eight-run Daytona cohort. Tasks 27 and 31 each use
two matched four-run strata, one on Daytona and one on AWS Fargate, with pooled
descriptive totals of eight attempts per model. Grok 4.6 solved 0/8, 6/8, 3/8,
0/8, and 0/8 attempts; Claude Opus 5 solved 8/8, 8/8, 8/8, 5/8, and 5/8 on the
corresponding tasks.

## Contents

- [Pass@k matrix](#passk-matrix)
- [Task inventory](#task-inventory)
- [Failure mode analysis](#failure-mode-analysis)
  - [Rule-combination error](#rule-combination-error)
  - [Incomplete implementation](#incomplete-implementation)
  - [Mock-only verification](#mock-only-verification)
  - [Incomplete authority semantics](#incomplete-authority-semantics)
  - [Dropped collaborator context](#dropped-collaborator-context)
- [Evidence and controls](#evidence-and-controls)
- [Reproduction](#reproduction)

## Pass@k matrix

Each row contains eight valid trials. `c/n` is the observed solve count. The
table uses `pass@k = 1 - C(n-c, k) / C(n, k)`, the estimated chance that at
least one of `k` sampled attempts succeeds.
Rows are grouped by model; a blank model cell continues the model named above.
Tasks 2, 7, and 14 are single matched Daytona cohorts. For Tasks 27 and 31,
the eight-attempt rows are pooled descriptive estimates across the two equal
backend strata below, not results from one frozen runtime configuration.

<!-- MINI_SWE_MATRIX_START -->
| Model | Task | Solves `c/n` | pass@1 | pass@3 | pass@8 |
| --- | --- | ---: | ---: | ---: | ---: |
| Grok 4.6 | [Task 2](tasks/02-entitlement-overage-lines/instruction.md) | 0/8 | 0.0000 | 0.0000 | 0.0000 |
|  | [Task 7](tasks/07-multi-region-sweep/instruction.md) | 6/8 | 0.7500 | 1.0000 | 1.0000 |
|  | [Task 14](tasks/14-iam-role-validation/instruction.md) | 3/8 | 0.3750 | 0.8214 | 1.0000 |
|  | [Task 27](tasks/27-tax-jurisdiction/instruction.md) | 0/8 | 0.0000 | 0.0000 | 0.0000 |
|  | [Task 31](tasks/31-customer-onboarding/instruction.md) | 0/8 | 0.0000 | 0.0000 | 0.0000 |
| Opus 5 | [Task 2](tasks/02-entitlement-overage-lines/instruction.md) | 8/8 | 1.0000 | 1.0000 | 1.0000 |
|  | [Task 7](tasks/07-multi-region-sweep/instruction.md) | 8/8 | 1.0000 | 1.0000 | 1.0000 |
|  | [Task 14](tasks/14-iam-role-validation/instruction.md) | 8/8 | 1.0000 | 1.0000 | 1.0000 |
|  | [Task 27](tasks/27-tax-jurisdiction/instruction.md) | 5/8 | 0.6250 | 0.9821 | 1.0000 |
|  | [Task 31](tasks/31-customer-onboarding/instruction.md) | 5/8 | 0.6250 | 0.9821 | 1.0000 |
<!-- MINI_SWE_MATRIX_END -->

### Runtime-stratified results for Tasks 27 and 31

Each model saw the same recorded task checksum within each four-run stratum.
The model comparison is therefore matched within the rows below.

| Task | Runtime stratum | Grok 4.6 | Opus 5 |
| --- | --- | ---: | ---: |
| Task 27 | Daytona, trials 01–04 | 0/4 | 4/4 |
| Task 27 | AWS Fargate, trials 05–08 | 0/4 | 1/4 |
| Task 31 | Daytona, trials 01–04 | 0/4 | 3/4 |
| Task 31 | AWS Fargate, trials 05–08 | 0/4 | 2/4 |

## Task inventory

| Task | What was asked |
| --- | --- |
| [Task&nbsp;2](tasks/02-entitlement-overage-lines/instruction.md) | Update invoice generation so customers are charged only for permitted usage above their allowance, while still showing free line items unless the invoice settings hide them. |
| [Task&nbsp;7](tasks/07-multi-region-sweep/instruction.md) | Update block-storage collection to check every enabled AWS region, retry rate limits, keep readable regions even when they are empty, and skip permanently unreadable regions without stopping the whole sweep. |
| [Task&nbsp;14](tasks/14-iam-role-validation/instruction.md) | Validate a customer's IAM role before saving it: assume the role with its external ID, confirm it can read instance inventory, reject the whole update if either check fails, and handle disconnects correctly. |
| [Task&nbsp;27](tasks/27-tax-jurisdiction/instruction.md) | Restore tax determination on issued invoices: choose among destination-priced, manual, and no-tax regimes, let a held exemption override the regime, quote the authority for the buyer's destination on the right account, print VAT identities for European parties, report a refused address without blocking the invoice, and file eligible settled sales. |
| [Task&nbsp;31](tasks/31-customer-onboarding/instruction.md) | Take on a new customer for a business: refuse a full plan or a reused identifier, settle on an identifier, open a contract on the offering they signed up to, put a card customer on the business' own connected payment account, persist the opening balance and free trial, meter the onboarding, and announce the new customer. |

The source task numbers are retained in task paths, headings, review bundles,
and recorded trial names so every result resolves to its recorded task and
runtime-checksum stratum.

## Failure mode analysis

<a id="rule-combination-error"></a>

### Rule-combination error (Task 2: 8/8 Grok rollouts)

These were eight independent attempts that repeated the same failure mode, not
eight different billing defects. Every Grok submission calculated allowance
and overage quantities, but combined the billing rules in the wrong order by
making positive owed quantity a prerequisite for every invoice line. That let
"nothing is owed" incorrectly remove zero-priced dimensions that the invoice
settings required it to show. All eight Opus submissions kept "what to charge"
separate from "what to show."

Task 2 had no successful Grok runs, so there is no within-Grok success example
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

### Incomplete implementation (Task 7: 2/8 Grok rollouts)

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

[Failed Grok code](sample-run/review-bundle/07-multi-region-sweep/grok-solution/trial-01/awsEc2.ts),
[failed Grok trace](sample-run/review-bundle/07-multi-region-sweep/trajectories/grok/trial-01.json),
[solving Grok code](sample-run/review-bundle/07-multi-region-sweep/grok-solution/trial-02/awsEc2.ts),
and
[paired Opus trace](sample-run/review-bundle/07-multi-region-sweep/trajectories/opus/trial-01.json)

<a id="mock-only-verification"></a>

### Mock-only verification (Task 14: 5/8 Grok rollouts)

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

[Failed Grok code](sample-run/review-bundle/14-iam-role-validation/grok-solution/trial-01/settings.service.ts),
[failed Grok trace](sample-run/review-bundle/14-iam-role-validation/trajectories/grok/trial-01.json),
[solving Grok code](sample-run/review-bundle/14-iam-role-validation/grok-solution/trial-06/settings.service.ts),
and
[paired Opus trace](sample-run/review-bundle/14-iam-role-validation/trajectories/opus/trial-01.json)

<a id="incomplete-authority-semantics"></a>

### Incomplete authority semantics (Task 27: 8/8 Grok rollouts)

These were eight independent attempts at the same tax workflow, not eight
different billing defects. Every Grok submission issued invoices and talked to
the tax authority, then lost the exact values and branches the recorded month
requires. A representative run rounded a maintained rate of `286.125` to
`286.13`, inserted a blank line before VAT registrations, swallowed an address
the authority refused instead of reporting it, and filed sales whose invoice
state made them ineligible. The invoice still went out. The failure was not a
crash or a provider error.

Task 27 had no successful Grok runs, so there is no within-Grok success example
for this task. Five of the eight Opus runs kept the authority's unrounded rate
and tax, used the established VAT wording, reported the refused address, and
filed only the eligible settled sales. The three unsuccessful Opus runs missed
the same filing eligibility on two held-out destinations; they are a shared
near-miss, not a different task.

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

[Failed Grok code](sample-run/review-bundle/27-tax-jurisdiction/grok-solution/trial-01/invoice.entity.ts),
[failed Grok trace](sample-run/review-bundle/27-tax-jurisdiction/trajectories/grok/trial-01.json),
and
[paired Opus trace](sample-run/review-bundle/27-tax-jurisdiction/trajectories/opus/trial-01.json)

<a id="dropped-collaborator-context"></a>

### Dropped collaborator context (Task 31: 8/8 Grok rollouts)

All eight Grok runs implemented enrolment, opening balances, trials, metering,
and the customer-created announcement. What they did not do was hand the
business settings they had already read into contract creation. On every
accepted offering path the surviving `CreateContractDto` carries
`readSettingsResponseData`; the Grok submissions omitted it, so the contract
collaborator saw `None` where the held-out business id belonged.

Task 31 had no successful Grok runs, so there is no within-Grok success example
for this task. Five of the eight Opus runs read settings for the accepted
request and passed that entity into `ContractService.create`. The three
unsuccessful Opus runs missed the same handoff, or wired it and then dropped
an opening credit of `0.00` / a trial start date; they are useful shared
failures rather than evidence of a Grok-only mechanism.

A representative failed Grok implementation opens the contract without the
settings already in hand:

```ts
if (createCustomerDto.offeringId) {
    contract = await this.contractService.create({
        offeringId: createCustomerDto.offeringId,
        customerId,
        businessID,
        usageOverrides: usage,
        offeringEnrollmentDate,
    });
}
```

A representative Opus implementation reads settings once for the accepted
request and forwards them on the DTO the contract collaborator already names:

```ts
const [settingsEntity] = await this.settingsService.findAll({ businessID });
if (offeringId) {
    preparedContract = await this.contractService.create({
        customerId,
        businessID,
        offeringId,
        offeringEnrollmentDate,
        usageOverrides: usage,
        readSettingsResponseData: settingsEntity,
    } as CreateContractDto);
}
```

[Failed Grok code](sample-run/review-bundle/31-customer-onboarding/grok-solution/trial-01/customer.service.ts),
[failed Grok trace](sample-run/review-bundle/31-customer-onboarding/trajectories/grok/trial-01.json),
and
[paired Opus trace](sample-run/review-bundle/31-customer-onboarding/trajectories/opus/trial-01.json)

## Evidence and controls

- **Harness:** Harbor 0.18.0 with mini-SWE-agent 2.4.5 at high reasoning
  effort. Tasks 2, 7, and 14 ran in isolated Daytona sandboxes. Tasks 27 and 31
  use separately matched four-run Daytona and AWS Fargate strata.
- **Routes:** Grok 4.6 and Claude Opus 5 through Amazon Bedrock.
- **Denominator:** All 80 packaged model trials have a numeric reward, complete
  native trajectory, complete verifier evidence, and no Harbor exception.
- **Controls:** Every task has an oracle reward of `1.0` and a no-op reward of
  `0.0`. Recorded-runtime controls are included with the review bundles. A
  separate [post-normalization control manifest](sample-run/manifests/public-controls-validation.json)
  records a clean ten-trial Docker rerun on all five runnable public tasks.
- **Task 2 raw evidence:**
  [`sample-run/raw/grok-4.6-and-opus-5-eight-rollouts-20260819/`](sample-run/raw/grok-4.6-and-opus-5-eight-rollouts-20260819/)
  contains all 16 full Harbor attempts.
- **Tasks 7, 14, 27, and 31 evidence:** their complete trajectories, final Grok
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

## Reproduction

See [HANDOFF.md](HANDOFF.md) for credentials, checksum verification, controls,
cohort execution, evidence redaction, and matrix regeneration.
