# Discoverability

One row per rule the grader actually decides on, the route by which a competent
engineer could have known it, and the exact evidence. Nothing outside this table
changes the reward.

Routes are **stated** (in `instruction.md`), **derivable** (from code the agent
can read in `/app`), and **observable** (in the sandbox estate the agent can
query). Several rules carry more than one.

| # | Graded rule | Route | Evidence |
| ---: | --- | --- | --- |
| 1 | The set of regions swept is discovered at run time from EC2, not fixed in the code. | stated, observable | Prompt: *"Make the inventory sweeps work out for themselves which regions this account is switched on in and cover all of them, since accounts differ and the set changes."* In the sandbox, `DescribeRegions` returns six regions; the emulator will also answer inventory calls for region names it was never told about, returning nothing, so a guessed list adds regions that are not the account's. |
| 2 | A region the account has never opted into is not swept and is not in the result. | stated, observable | Prompt: *"Regions it never turned on are not our concern."* Sandbox `me-south-1` comes back from `DescribeRegions` only under `AllRegions`, marked `not-opted-in`; it holds a volume and a snapshot carrying the swept dimension, and any inventory call signed for it is answered `AuthFailure`. |
| 3 | A region that is switched on but holds nothing matching appears in the result as an empty region. | stated, derivable | Prompt: *"a region we are switched on in that holds nothing matching should still come back as a region we looked at and found nothing."* The workspace's own single-region sweep returns `{ [region]: volumes }` whether or not anything was found, and `ebsvolumeDataGatherer.service.ts` consumes the result as `Object.keys(volumes)` then `volumes[regionCode].map(...)`, which is written to tolerate an empty region. |
| 4 | A region whose read is refused is absent from the result rather than reported as empty. | stated, observable | Prompt: *"a region that will not let us read it must be left out rather than passed off as empty."* Sandbox `ap-south-1` answers `DescribeVolumes` with `UnauthorizedOperation` while its `DescribeSnapshots` works, and `ap-northeast-2` is the mirror image, so the difference between "refused" and "empty" is visible locally on both sweeps. |
| 5 | One unreadable region does not abort the rest of the sweep. | stated, observable | Prompt: *"one bad region must not take the rest down with it."* The same two sandbox regions make an unguarded sweep throw before it reaches the regions that would have answered. |
| 6 | A region that only rate limits is retried until it answers, and its contents are included. | stated, observable | Prompt: *"A region merely rate limiting us has not failed, it just needs more patience."* Sandbox `sa-east-1` answers `RequestLimitExceeded` to the first four calls of each inventory read and then serves normally — more attempts than the AWS SDK allows by default — so a client left on the default budget visibly loses that region in the sandbox before it ever loses it at grading time. |
| 7 | What a region reports is that region's own inventory. | derivable, observable | The workspace sweep builds its client with an explicit `region`, and `getInstanceWithFilters` / `getAllInstanceIDs` take `region` as their first argument. In the sandbox every region holds different volumes and snapshots, so a client reused across regions returns one region's inventory under every key. |
| 8 | The caller's tag filter still selects what is collected. | derivable, observable | `ebsvolumeDataGatherer.service.ts` and `ebsSnapshotDataGatherer.service.ts` both call the sweep with `[{ Name: 'tag:meteringcoDimensionId', Values: [dimensionId] }]`, and the workspace sweep forwards `Filters` to the command. The sandbox carries `dim-object-storage-sandbox` and untagged resources alongside the swept dimension. |
| 9 | Each region's inventory is read to the end of its token chain. | derivable, observable | The workspace sweeps already loop on `NextToken`. The sandbox caps both inventory reads at three records a page while `eu-west-1` holds five matching volumes and `eu-central-1` four matching snapshots. |

## Rules deliberately not graded

- **How the result is keyed beyond region name.** Any object keyed by region, or
  a `Map` of the same, is accepted.
- **Whether `getAllRegions` comes back.** The driver calls the two sweep
  functions the repository already exports; how region discovery is factored
  behind them is free, and the alternative implementation checked in the README
  puts it in a different module with a different shape.
- **Sizes, costs, tiers, IOPS, tags or any other property of the inventory.**
  Only which regions were covered and which resource identifiers were found in
  each. Inventory economics belong to other tasks in this corpus.

## Faults, and where they appear

Every fault the grader leans on is in the sandbox at the same dose, on a
different region and sometimes a different action, so no hazard is first met at
grading time.

| fault | sandbox | held out |
| --- | --- | --- |
| region never opted into | `me-south-1` (holds matching resources) | `af-south-1` (holds matching resources), `il-central-1` (empty) |
| read refused with `UnauthorizedOperation` | `ap-south-1` volumes, `ap-northeast-2` snapshots | `eu-north-1` volumes, `ap-northeast-1` snapshots |
| `RequestLimitExceeded` on the first four calls | `sa-east-1`, both reads | `ap-southeast-2` volumes, `ca-central-1` snapshots |
| three-record pages | both reads | both reads |
