# Reproducing the selected cohort

The repository contains the selected task definition, complete recorded
evidence, and a reproduction configuration with the same model, agent,
reasoning, sandbox, and verifier settings. Organization identifiers were
normalized consistently across the task and evidence for publication; task
requirements, numeric fixtures, model outputs, and verifier rewards were not
changed. The public task's oracle and no-op controls were rerun after that
normalization.

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
results do not mix with the packaged denominator.

```sh
harbor run --config harness/controls.json --yes
PYTHONPATH="$PWD" harbor run --config harness/cohort.json --yes
```

If an infrastructure or provider failure leaves a cell below eight valid
trials, launch only the missing attempts:

```sh
python3 harness/launch_remainders.py --model all
```

## 4. Index a reproduced cohort

To summarize the packaged cohort, use the default command:

```sh
python3 harness/summarize_cohort.py
```

For a reproduced cohort, point the indexer at the new model job directory. It
will read the matching reproduction controls from the sibling control job:

```sh
python3 harness/summarize_cohort.py \
  --raw-dir sample-run/raw/xai-selected-eight-rollout-reproduction
```

A valid trial requires a numeric verifier reward, complete trajectory,
complete verifier artifact, and no Harbor exception. Preserve provider or
infrastructure failures as unscored evidence.

Before publishing captured output, redact provider credentials and scan the
result:

```sh
python3 harness/redact_artifacts.py
```
