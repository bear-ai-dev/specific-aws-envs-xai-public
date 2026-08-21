# Reproducing the five selected cohorts

The repository contains all five selected task definitions, complete recorded
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

The model routes are the Bedrock inference profiles `us.xai.grok-4.6` (through
LiteLLM's Converse route) and `us.anthropic.claude-opus-5`. Provider
credentials are injected only for model access. The task images supply
separate credentials for their local AWS-compatible endpoints.

## 2. Verify the frozen inputs

Use Harbor 0.18.0 and mini-SWE-agent 2.4.5, then regenerate the manifest:

```sh
python3 harness/freeze_manifest.py
git diff --exit-code sample-run/manifests/frozen-cohort.json
```

## 3. Run controls and model trials

The reproduction job names differ from the stored evidence job names, so new
results do not mix with any packaged denominator. The control configuration
runs one oracle and one no-op attempt for each of Tasks 2, 7, 14, 27, and 31.

All five public task directories were validated after identifier normalization
with the same Docker control configuration. The ten
outcomes and Harbor task digests are recorded in
[`sample-run/manifests/public-controls-validation.json`](sample-run/manifests/public-controls-validation.json).
Tasks 27 and 31 also ship recorded Daytona-stratum oracle and no-op evidence in
their review bundles.

```sh
harbor run --config harness/controls.json --yes
PYTHONPATH="$PWD" harbor run --config harness/cohort.json --yes
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

To verify and regenerate the packaged 80-trial index, use the default command:

```sh
python3 harness/summarize_cohort.py
```

The packaged Task 2 attempts are stored as full raw Harbor trees. Tasks 7, 14,
27, and 31 use compact review bundles containing native trajectories, final
code, touched files, and complete verifier evidence. The default indexer reads
both evidence layouts. Packaged Tasks 27 and 31 include one matched four-run
Daytona stratum and one separately matched four-run AWS Fargate stratum per
model. Their eight-attempt totals are pooled descriptive results, not one
frozen runtime configuration.

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
