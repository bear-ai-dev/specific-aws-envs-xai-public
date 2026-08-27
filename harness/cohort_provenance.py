"""Recorded runtime strata for the packaged model evidence.

Tasks 1, 2 and 3 each use one Daytona checksum stratum shared by both models.
Task 4 was completed in two separately frozen four-attempt strata, one on
Daytona and one on AWS Fargate.

Tasks 5 to 7 were built once per model arm, so each arm carries its own Harbor
task checksum and its own stratum. The published task packages for those three
are byte-identical to the packages the Opus arm ran against, recorded as
build_equivalence in sample-run/manifests/frozen-cohort.json, so the arms remain
comparable even though the recorded checksums differ.
"""

from __future__ import annotations


RECORDED_RUNTIME_STRATA = {
    "01-entitlement-overage-lines": (
        {
            "name": "daytona-01-08",
            "environment": "daytona",
            "trial_numbers": tuple(range(1, 9)),
            "task_checksum": "04e4ebcca22fe9b0c68986d4cd84317da27cd43e78a2e3c22b7cc405209c7629",
        },
    ),
    "02-multi-region-sweep": (
        {
            "name": "daytona-01-08",
            "environment": "daytona",
            "trial_numbers": tuple(range(1, 9)),
            "task_checksum": "adf7570d43b056146eb1fd14c17c145ceaa7f09864842ed3782daf563407040a",
        },
    ),
    "03-iam-role-validation": (
        {
            "name": "daytona-01-08",
            "environment": "daytona",
            "trial_numbers": tuple(range(1, 9)),
            "task_checksum": "a0ce8d2b0f7ee76b6777add8da5e172683815037735668e761c00e8ee9da8ab2",
        },
    ),
    "04-tax-jurisdiction": (
        {
            "name": "daytona-01-04",
            "environment": "daytona",
            "trial_numbers": tuple(range(1, 5)),
            "task_checksum": "b7b4aae506e7aafc2399ba423e4b25887cb5a8c6e7f726185f72560247200a98",
        },
        {
            "name": "fargate-05-08",
            "environment": "aws-fargate",
            "trial_numbers": tuple(range(5, 9)),
            "task_checksum": "bea753509f8689709ac2827ebc01c71b0cad2119ac99d51a87661c180ace6785",
        },
    ),
    "05-network-egress-metering": (
        {
            "name": "daytona-grok-01-08",
            "environment": "daytona",
            "model_label": "Grok 4.6",
            "trial_numbers": tuple(range(1, 9)),
            "task_checksum": "edbaa55fe7240b126b3b47a1e33b25df9475e97f89031972eeedb2076bf7f498",
        },
        {
            "name": "daytona-opus-01-07",
            "environment": "daytona",
            "model_label": "Opus 5",
            "trial_numbers": tuple([1, 2, 3, 4, 5, 6, 7]),
            "task_checksum": "6427d0d789ad611f6ebe201045f26ed7c62da6e71722d8792558a0fdf37c2b56",
        },
        {
            "name": "daytona-opus-08",
            "environment": "daytona",
            "model_label": "Opus 5",
            "trial_numbers": tuple([8]),
            "task_checksum": "3f7e8cc2f7d5910314cab6ee5598e5333a6599880f896994887590c69373231a",
        },
    ),
    "06-api-token-metering": (
        {
            "name": "daytona-grok-01-08",
            "environment": "daytona",
            "model_label": "Grok 4.6",
            "trial_numbers": tuple(range(1, 9)),
            "task_checksum": "4752c91a46310743198600c4182aafad05b54023c6cfec7c75e6497e1f62c96e",
        },
        {
            "name": "daytona-opus-01-08",
            "environment": "daytona",
            "model_label": "Opus 5",
            "trial_numbers": tuple(range(1, 9)),
            "task_checksum": "28a06245e0c745b4801d176437331dafcfbe631d51473b67d1050e58b355d134",
        },
    ),
    "07-api-keys-and-environments": (
        {
            "name": "daytona-grok-01-08",
            "environment": "daytona",
            "model_label": "Grok 4.6",
            "trial_numbers": tuple(range(1, 9)),
            "task_checksum": "3f6269b97803f429411916a6f0dc1325aecfd69f3a1e995fbd20d5c7bbb17d16",
        },
        {
            "name": "daytona-opus-01-08",
            "environment": "daytona",
            "model_label": "Opus 5",
            "trial_numbers": tuple(range(1, 9)),
            "task_checksum": "3f38fb2bc343a749016fa1425494c139f4baa0c44e84bb84c618d32ec94bb78e",
        },
    ),
}


def stratum_for(task: str, trial_number: int, model_label: str | None = None) -> dict:
    """Return the declared runtime stratum for one packaged trial.

    Tasks 1 to 4 declare one stratum per trial range and both models share it.
    Tasks 5 to 7 were built per model arm, so their strata also carry a
    model_label and the caller must say which arm it is asking about.
    """
    for stratum in RECORDED_RUNTIME_STRATA[task]:
        if trial_number not in stratum["trial_numbers"]:
            continue
        declared = stratum.get("model_label")
        if declared is None or model_label is None or declared == model_label:
            return stratum
    raise KeyError(f"no runtime stratum for {task} trial {trial_number} {model_label}")
