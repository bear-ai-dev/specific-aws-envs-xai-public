# Task 7 — multi-region sweep

## Headline result

| Model | Solves `c/n` | pass@1 | pass@3 | pass@8 |
| --- | ---: | ---: | ---: | ---: |
| Grok 4.6 | 6/8 | 0.7500 | 1.0000 | 1.0000 |
| Opus 5 | 8/8 | 1.0000 | 1.0000 | 1.0000 |

A feature-removal task cut from a real NestJS TypeScript backend
(`meteringco-src/extracted/top-up-billing-lifecycle`, 534 `.ts` files, 87 runtime
dependencies). The agent works in the actual repository, not a purpose-built
skeleton, and there is no specification document anywhere in the box.

## What was taken out

The metering utilities used to ask EC2 which regions the account was switched
on in and run every inventory sweep across that discovered set, folding the
per-region results into one map keyed by region. What the workspace ships
without is that whole layer: region discovery itself, the fan-out over regions,
and the decisions that go with it — which regions belong in the report, what a
region that answers with nothing looks like next to one that would not answer at
all, and what a single unreachable region does to the rest of the run.

What is left is a coherent single-region collector. `getAllVolumes` and
`getAllSnapshots` build one client for the process' own region, walk that
region's token chain, and return `{ [region]: found }`; the instance-uptime
collector reads its one region directly. That is a correct implementation of a
business that operates in one place, which is what the code reads like, not like
something with a hole in it.

| file | change vs upstream |
| --- | --- |
| `src/utils/aws/awsEc2.ts` | `getAllRegions` deleted with its `DescribeRegionsCommand` import; both inventory sweeps rewritten around a single client (+32 / −61) |
| `src/microservices/instanceUpTime/instanceUptime.service.ts` | the per-region fan-out and its per-region error handling replaced by one call (+3 / −13) |

Nothing else moved. `getInstanceWithFilters`, `getAllInstanceIDs` and
`getReservedInstanceCount` are untouched — the instance-type enrichment inside
`getAllInstanceIDs` belongs to task 08 and was not altered. The two EBS
gatherers that consume the sweeps are exactly what upstream had, so the map
shape a solution has to produce is not something the task invented.

There are no stubs, no `TODO`s about the absent behaviour, no commented-out
code, no `not supported` throws, and no `.git` directory. The words region
discovery, opt-in and coverage appear nowhere the agent can read.

## What this task is not about

The corpus already covers EBS volume inventory and EBS snapshot cost elsewhere,
and nothing here grades either. The reward looks at which regions a sweep
covered and which resource identifiers turned up in each. Sizes, tiers, IOPS,
tags, prices and every other property of the inventory are ignored.

## Where the rules live

`DISCOVERABILITY.md` carries the full table, one row per graded rule with its
route and evidence. In summary:

| source | what it yields |
| --- | --- |
| `instruction.md` | the coverage contract: discover the regions, keep an empty region in the report, keep an unreadable one out, do not let one region sink the sweep, and be patient with a region that only rate limits |
| `src/utils/aws/awsEc2.ts` | that a sweep returns a map keyed by region, forwards the caller's `Filters`, walks `NextToken`, and builds its client with an explicit region |
| `ebsvolumeDataGatherer.service.ts`, `ebsSnapshotDataGatherer.service.ts` | that the map is consumed as `Object.keys(...)` then `map` per region, and the tag filter the sweeps are called with |
| the sandbox estate | that `DescribeRegions` reports an opt-in status; that a region can refuse one read and serve another; that one region rate limits past the SDK's default attempt budget; that inventory differs per region; that the emulator will answer for a region the account has nothing to do with |

An agent that reads only the remaining code sees one region and a loop, and
will write a fan-out that seeds every discovered region and swallows errors.
That is the `m1` mutant below, and it scores 0.0.

## How it is graded

`tests/test.sh` stops the agent-facing endpoint, restarts the emulator on a
held-out estate, drops a root-owned driver into `/app`, and asks the submission
for one volume sweep and one snapshot sweep. It never trusts an exit code or
stdout. The driver accepts a plain object or a `Map` keyed by region and reduces
each region to the identifiers it reported.

`tests/compute_reward.py` runs as root, loads no submitted code, and re-derives
the correct coverage from the held-out document with its own reference model:
the enabled regions, minus those whose fault for that action never clears, each
carrying the resources in that region that match the swept dimension. Reward is
1.0 only if, for both sweeps, the region key set matches exactly and every
region's identifier set matches exactly.

Two sweeps are exercised, and between them they place every case class on a
different region:

| case | held-out example | correct outcome |
| --- | --- | --- |
| region switched on, holds matching resources | `us-east-1`, both sweeps | present, with those resources |
| region switched on, holds nothing matching | `eu-west-2` volumes, `us-west-2` snapshots | present, empty |
| region switched on, read refused | `eu-north-1` volumes, `ap-northeast-1` snapshots | absent from that sweep, present in the other |
| region switched on, read rate limited then allowed | `ap-southeast-2` volumes, `ca-central-1` snapshots | present, with those resources |
| region never opted into, holds matching resources | `af-south-1` | absent |
| region never opted into, holds nothing | `il-central-1` | absent |
| region the account has nothing to do with | any name not in the estate | absent; the emulator answers it with nothing |
| more matching resources than fit a page | `us-west-2` volumes, `eu-west-2` snapshots | all of them |

Measured without Docker, each candidate driven against the held-out estate by
the real driver and scored by the real `compute_reward.py`, with an empty host
environment (`env -i`):

| candidate | reward |
| --- | --- |
| reference solution | **1.0** |
| starting workspace, unchanged | **0.0** |
| `m1` fan-out that seeds every discovered region and then overwrites the ones that answered | 0.0 |
| `m2` fan-out with no per-region error handling | 0.0 |
| `m3` discovery via `AllRegions`, opt-in status ignored | 0.0 |
| `m4` correct in every other way, left on the SDK's default attempt budget | 0.0 |
| `m5` one client reused for every region | 0.0 |
| separate `RegionCoverage` module: `AllRegions` then filtered, sequential, its own retry classifier with SDK retries switched off, returns a `Map` | **1.0** |

The failures are distinct rather than incidental: `m1` reports the refused
regions as empty, `m2` never returns at all, `m3` reports the two regions the
account never opted into, `m4` loses the rate-limited region from each sweep,
and `m5` files `us-east-1`'s inventory under every key.

## Sandbox vs held-out estate

The box serves `/opt/metering-sandbox/public.json`: one metered account, seven
regions, eighteen volumes and fifteen snapshots. Every case class the grader
distinguishes is present in kind — a region that is switched on and empty for
one sweep, a region that refuses the volume read while serving snapshots and
another that does the reverse, a region that rate limits the first four calls of
both reads, and a region that was never opted into but holds matching
resources.

The held-out estate is a different account in a different set of nine regions,
twenty-three volumes and eighteen snapshots, with the refusals and the rate
limits on different regions and different actions, two never-opted-into regions
rather than one, and identifiers that share nothing with the sandbox. Passing
locally is not evidence of passing the grade; reproducing the local answer is a
guaranteed zero.

Both inventory reads page three records at a time in both documents. Walking a
token chain is a habit both target models already have, so this is present to
stop a sweep that ignores the chain from looking correct on a tiny estate, not
as a source of difficulty.

## Layout

```
environment/Dockerfile          image: node 22, python 3, the repo at /app
environment/task-init.sh        starts the emulated endpoint on :4566
environment/workspace/          the repository, capability removed
environment/mockaws/            task-owned copy of the emulated control plane
environment/sandbox/            world-readable fixture + sandbox notes
environment/verifier-data/      root-only: held-out estate, run spec, driver
environment/gen_scenarios.py    regenerates both estate documents
instruction.md                  the prompt (624 characters, one paragraph)
DISCOVERABILITY.md              one row per graded rule, route and evidence
solution/solution.patch         the oracle (2 files, +93 / −37)
tests/test.sh                   verifier entry point
tests/compute_reward.py         trusted scorer with its own reference model
```

`environment/mockaws/` diverges from the copy this task was branched from on
purpose. It is region-aware: every request is served against the region its
SigV4 credential scope names, so instances, volumes and snapshots are scoped per
region; it answers `DescribeRegions` with an opt-in status and honours
`AllRegions`; a region can be declared as refusing a named action outright or as
refusing it a fixed number of times before serving it; and EC2 errors now use
EC2's own `Errors/Error/Code` envelope rather than the generic query-protocol
one, without which the AWS SDK cannot classify a throttle and will not retry it.

## Regenerating

```
python3 environment/gen_scenarios.py \
    --out-dir environment/sandbox --verifier-dir environment/verifier-data
```
