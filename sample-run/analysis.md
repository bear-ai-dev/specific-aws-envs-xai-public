# Fresh eight-run Bedrock cohort analysis

## Contents

- [Selection result](#selection-result)
- [Observed model difference](#observed-model-difference)
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
rewards, and trial ordering were not changed. The public task's oracle and
no-op controls were rerun after normalization.
