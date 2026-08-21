# Sample RL Tasks for AWS - xAI

This sample contains three frozen AWS tasks evaluated in matched eight-run
Bedrock cohorts. Grok 4.6 solved 0/8, 6/8, and 3/8 attempts; Claude Opus 5
solved 8/8 attempts on each corresponding task.

## Contents

- [Pass@k matrix](#passk-matrix)
- [Task inventory](#task-inventory)
- [Failure mode analysis](#failure-mode-analysis)
  - [Rule-combination error](#rule-combination-error)
  - [Incomplete implementation](#incomplete-implementation)
  - [Mock-only verification](#mock-only-verification)
- [Evidence and controls](#evidence-and-controls)
- [Reproduction](#reproduction)

## Pass@k matrix

Each row contains eight valid Harbor trials. `c/n` is the observed solve count.
The table uses `pass@k = 1 - C(n-c, k) / C(n, k)`, the estimated chance that at
least one of `k` sampled attempts succeeds.
Rows are grouped by model; a blank model cell continues the model named above.

<!-- MINI_SWE_MATRIX_START -->
| Model | Task | Solves `c/n` | pass@1 | pass@3 | pass@8 |
| --- | --- | ---: | ---: | ---: | ---: |
| Grok 4.6 | [Task 2](tasks/02-entitlement-overage-lines/instruction.md) | 0/8 | 0.0000 | 0.0000 | 0.0000 |
|  | [Task 7](tasks/07-multi-region-sweep/instruction.md) | 6/8 | 0.7500 | 1.0000 | 1.0000 |
|  | [Task 14](tasks/14-iam-role-validation/instruction.md) | 3/8 | 0.3750 | 0.8214 | 1.0000 |
| Opus 5 | [Task 2](tasks/02-entitlement-overage-lines/instruction.md) | 8/8 | 1.0000 | 1.0000 | 1.0000 |
|  | [Task 7](tasks/07-multi-region-sweep/instruction.md) | 8/8 | 1.0000 | 1.0000 | 1.0000 |
|  | [Task 14](tasks/14-iam-role-validation/instruction.md) | 8/8 | 1.0000 | 1.0000 | 1.0000 |
<!-- MINI_SWE_MATRIX_END -->

## Task inventory

| Task | What was asked |
| --- | --- |
| [Task&nbsp;2](tasks/02-entitlement-overage-lines/instruction.md) | Update invoice generation so customers are charged only for permitted usage above their allowance, while still showing free line items unless the invoice settings hide them. |
| [Task&nbsp;7](tasks/07-multi-region-sweep/instruction.md) | Update block-storage collection to check every enabled AWS region, retry rate limits, keep readable regions even when they are empty, and skip permanently unreadable regions without stopping the whole sweep. |
| [Task&nbsp;14](tasks/14-iam-role-validation/instruction.md) | Validate a customer's IAM role before saving it: assume the role with its external ID, confirm it can read instance inventory, reject the whole update if either check fails, and handle disconnects correctly. |

The source task numbers are retained in task paths, headings, review bundles,
and recorded trial names so every result resolves to the exact frozen task that
produced it.

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
