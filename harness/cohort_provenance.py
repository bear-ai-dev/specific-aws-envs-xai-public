"""Recorded runtime strata for the packaged model evidence.

The first three tasks use one Daytona checksum stratum. Task 4 was completed
in two separately frozen four-attempt strata, one on Daytona and one on AWS
Fargate. Models are comparable within each stratum; its eight-attempt totals
are pooled descriptive counts across the strata.
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
}


def stratum_for(task: str, trial_number: int) -> dict:
    """Return the declared runtime stratum for one packaged trial."""
    for stratum in RECORDED_RUNTIME_STRATA[task]:
        if trial_number in stratum["trial_numbers"]:
            return stratum
    raise KeyError(f"no runtime stratum for {task} trial {trial_number}")
