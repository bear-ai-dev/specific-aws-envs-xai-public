"""Public task identifiers and their immutable recorded-evidence identifiers."""

from __future__ import annotations


PUBLIC_TASKS = (
    "01-entitlement-overage-lines",
    "02-multi-region-sweep",
    "03-iam-role-validation",
    "04-tax-jurisdiction",
    "05-network-egress-metering",
    "06-api-token-metering",
    "07-api-keys-and-environments",
    "08-dimension-pricing-tiers",
    "09-s3-datastore-measurement",
    "10-customer-identity-migration",
    "11-customer-billing-schedule-migration",
)

RECORDED_TASK_BY_PUBLIC = {
    "01-entitlement-overage-lines": "02-entitlement-overage-lines",
    "02-multi-region-sweep": "07-multi-region-sweep",
    "03-iam-role-validation": "14-iam-role-validation",
    "04-tax-jurisdiction": "27-tax-jurisdiction",
    "05-network-egress-metering": "05-network-egress-metering",
    "06-api-token-metering": "06-api-token-metering",
    "07-api-keys-and-environments": "07-api-keys-and-environments",
    "08-dimension-pricing-tiers": "08-dimension-pricing-tiers",
    "09-s3-datastore-measurement": "09-s3-datastore-measurement",
    "10-customer-identity-migration": "10-customer-identity-migration",
    "11-customer-billing-schedule-migration": "11-customer-billing-schedule-migration",
}

PUBLIC_TASK_BY_RECORDED = {
    recorded: public for public, recorded in RECORDED_TASK_BY_PUBLIC.items()
}

TASK_LABELS = {
    task: f"Task {int(task.split('-', 1)[0])}" for task in PUBLIC_TASKS
}


def public_task_for(task: str) -> str | None:
    """Resolve either a public or recorded task identifier to its public ID."""
    if task in PUBLIC_TASKS:
        return task
    return PUBLIC_TASK_BY_RECORDED.get(task)


def recorded_task_for(task: str) -> str:
    """Return the immutable recorded-evidence identifier for a public task."""
    return RECORDED_TASK_BY_PUBLIC[task]
