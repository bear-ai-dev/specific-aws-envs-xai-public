# Reproducing the eleven selected tasks

The repository contains all eleven selected task definitions, complete recorded
evidence, and a reproduction configuration with the same model, agent,
reasoning, and verifier settings. The recorded runtime environment is declared
per checksum stratum in the frozen manifest. Organization identifiers were
normalized consistently across tasks and evidence for publication. Task
requirements, model-generated control flow, trial ordering, and verifier
rewards were not changed. The MIT-licensed microinvoice runtime is vendored
unchanged under the publication-neutral package scope so every task remains
clean-installable.

## 1. Configure credentials

Keep credentials outside Git and export them in the shell that launches Harbor:

```sh
export DAYTONA_API_KEY=...
export AWS_ACCESS_KEY_ID=...
export AWS_SECRET_ACCESS_KEY=...
export AWS_SESSION_TOKEN=...       # omit for long-lived credentials
export AWS_REGION=us-east-1
export AWS_DEFAULT_REGION=us-east-1
```

The recorded routes are the Bedrock inference profiles `us.xai.grok-4.6`
(through LiteLLM's Converse route), `us.anthropic.claude-opus-5` for Tasks 1 to
7, and `global.anthropic.claude-opus-5` for Tasks 8 to 11. Provider credentials
are injected only for model access. The task images supply separate credentials
for their local AWS-compatible endpoints.

The recorded Opus 5 evidence for Tasks 8 to 11 used opencode 1.18.13 for
attempts 01 to 04 and mini-SWE-agent 2.4.5 for attempts 05 to 08. The supplied
all-task comparison configuration uses mini-SWE-agent 2.4.5 and the US Opus
profile for new attempts. To match the route and scaffold of the recorded
mini-SWE attempts on Tasks 8 to 11, use
[`cohort-tasks-08-11-global-opus.json`](harness/cohort-tasks-08-11-global-opus.json).
The four historical opencode attempts remain inspectable evidence, but this
repository does not present the mini-SWE config as a reproduction of that
different scaffold.

## 2. Verify the frozen inputs

Use Harbor 0.18.0 and mini-SWE-agent 2.4.5, then regenerate the manifest:

```sh
python3 harness/freeze_manifest.py
git diff --exit-code sample-run/manifests/frozen-cohort.json
```

## 3. Run controls and model trials

The reproduction job names differ from the stored evidence job names, so new
results do not mix with any packaged denominator. The control configuration
runs one oracle and one no-op attempt for every public task.

The control inventory records one oracle solve and one no-op failure for every
task, together with the applicable Harbor task identity and current publication
task hash. The 22 outcomes are recorded in
[`sample-run/manifests/public-controls-validation.json`](sample-run/manifests/public-controls-validation.json).
Its job-level `stage` field is material: Tasks 1 to 4 were rerun
post-normalization, while Tasks 5 to 11 retain recorded-build controls. For the
latter, the current public hash is an inventory comparison and not evidence
that the controls were executed again after public packaging.
Task 4 also ships recorded Daytona-stratum oracle and no-op evidence in its
review bundle.

```sh
harbor run --config harness/controls.json --yes
PYTHONPATH="$PWD" harbor run --config harness/cohort.json --yes
```

For a fresh four-attempt stratum matching the recorded Task 8–11 mini-SWE
route, scaffold, reasoning setting, and task set:

```sh
PYTHONPATH="$PWD" harbor run \
  --config harness/cohort-tasks-08-11-global-opus.json --yes
```

To reproduce the publication-only local control check:

```sh
harbor run --config harness/controls.json --yes
python3 harness/summarize_public_controls.py sample-run/raw/<control-job-name>
```

If an infrastructure or provider failure leaves a cell below eight valid
trials, launch only the missing attempts:

```sh
python3 harness/launch_remainders.py --model all
```

## 4. Index a reproduced cohort

To verify and regenerate the packaged 176-trial index, use the default command:

```sh
python3 harness/summarize_cohort.py
```

The packaged Task 1 attempts are stored as full raw Harbor trees. Tasks 2 to 11
use compact review bundles containing native trajectories, final code or
patches, touched files or patches, and complete verifier evidence. The default
indexer reads both evidence layouts. Packaged Task 4 includes one matched four-run
Daytona stratum and one separately matched four-run AWS Fargate stratum per
model. Its eight-attempt totals are pooled descriptive results, not one
frozen runtime configuration. Tasks 8 to 11 also retain descriptive pooled
Opus solve totals, but the matrix keeps their four opencode attempts and four
mini-SWE-agent attempts separate for pass@k.

For a newly reproduced cohort, point the indexer at the new model job directory.
It will read the matching reproduction controls from the sibling control job:

```sh
python3 harness/summarize_cohort.py \
  --raw-dir sample-run/raw/xai-selected-eight-rollout-reproduction
```

A valid trial requires a numeric verifier reward, complete trajectory,
complete verifier artifact, no Harbor exception, and model matching within its
recorded runtime-checksum stratum. Preserve provider or infrastructure failures
as unscored evidence.

Before publishing captured output, redact provider credentials and scan the
result:

```sh
python3 harness/redact_artifacts.py
```
