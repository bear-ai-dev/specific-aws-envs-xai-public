#!/usr/bin/env python3
"""Author the sandbox estate, the held-out estate and the graded onboarding runs.

Three documents come out of here and they are deliberately different from one
another:

  sandbox/public.json        the estate the box serves to the agent, holding a
                             month of provisioning records the same reference
                             implementation produced, so the shape of a
                             provisioned customer is observable without any
                             access to the graded run.
  verifier-data/holdout.json the estate the verifier serves. Same shape, a
                             business the agent has never seen, and an empty
                             bucket for the driver to leave observations in.
  verifier-data/run-spec.json the onboarding requests the submission is driven
                             with, plus the service configuration to drive it
                             under. Never enters the agent's filesystem.

Nothing here computes what a correct implementation should do. The expected
behaviour is worked out from these inputs by tests/compute_reward.py, at scoring
time, as root, with no submitted code in the process.
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent

REGION = "us-east-1"
PLATFORM_ACCOUNT = "647662420899"
OBSERVATION_BUCKET = "meteringco-provisioning-audit-dev"
RECORD_BUCKET = "meteringco-config-archive-dev"

# --------------------------------------------------------------------------
# Graded onboarding requests.
#
# Each entry is what an API caller sends plus the state of the collaborators
# the request meets on the way through: the entitlement position for the
# caller, the customers the business already has, its settings row, the
# contract the contract service hands back for the offering named, and whether
# token metering is available. None of it says what should happen.
# --------------------------------------------------------------------------

BIZ = "biz_northwind"
SUBJECT = "auth0|6913f0c7a41d2b5e8fd41c72"

SETTINGS_NO_CONNECT = {
    "businessID": BIZ,
    "accountState": "sandbox",
    "stripeAccountId": "",
    "businessName": "Northwind Telemetry",
    "currency": "USD",
}
SETTINGS_CONNECTED = {
    "businessID": BIZ,
    "accountState": "production",
    "stripeAccountId": "acct_1PmQ4ZBw3nLxTgVe",
    "businessName": "Northwind Telemetry",
    "currency": "USD",
}

ENTITLEMENT_OK = {"entitlementExceeded": False, "entitlementValue": "250", "currentValue": "184"}
ENTITLEMENT_HIT = {"entitlementExceeded": True, "entitlementValue": "250", "currentValue": "250"}

OFFERING_ROW = {
    "offeringId": "off_metered_growth",
    "offeringName": "Growth (metered)",
    "offeringType": "usageBased",
    "currency": "USD",
    "dimensions": [],
}


def contract(**overrides):
    base = {
        "message": "contract created",
        "offeringEnrollmentDate": "2026-07-14T00:00:00.000Z",
        "readOfferingResponseData": OFFERING_ROW,
        "overridesForOffering": {},
    }
    base.update(overrides)
    return base


HOLDOUT_RUNS = [
    {
        "label": "manual-no-offering",
        "subject": SUBJECT,
        "dto": {
            "businessID": BIZ,
            "customerName": "Cascade Freight",
            "email": "ap@cascadefreight.example",
            "paymentChannel": "manual",
        },
        "entitlement": ENTITLEMENT_OK,
        "existingCustomerIds": ["nw-0007", "nw-0008"],
        "settings": SETTINGS_NO_CONNECT,
        "contract": None,
        "tokenMetering": "ok",
        "stripe": {"stripeCustomerId": "cus_unused", "portalUrl": "https://billing.example/unused"},
    },
    {
        "label": "caller-supplied-id-free",
        "subject": SUBJECT,
        "dto": {
            "businessID": BIZ,
            "customerId": "nw-1042",
            "customerName": "Harborline Logistics",
            "email": "billing@harborline.example",
            "paymentChannel": "manual",
            "customerVatId": "GB482910337",
            "taxExempt": "none",
        },
        "entitlement": ENTITLEMENT_OK,
        "existingCustomerIds": ["nw-0007", "nw-0008"],
        "settings": SETTINGS_NO_CONNECT,
        "contract": None,
        "tokenMetering": "ok",
        "stripe": {"stripeCustomerId": "cus_unused", "portalUrl": "https://billing.example/unused"},
    },
    {
        "label": "caller-supplied-id-taken",
        "subject": SUBJECT,
        "dto": {
            "businessID": BIZ,
            "customerId": "nw-0008",
            "customerName": "Harborline Logistics",
            "email": "billing@harborline.example",
            "paymentChannel": "manual",
        },
        "entitlement": ENTITLEMENT_OK,
        "existingCustomerIds": ["nw-0007", "nw-0008"],
        "settings": SETTINGS_NO_CONNECT,
        "contract": None,
        "tokenMetering": "ok",
        "stripe": {"stripeCustomerId": "cus_unused", "portalUrl": "https://billing.example/unused"},
    },
    {
        "label": "entitlement-reached",
        "subject": SUBJECT,
        "dto": {
            "businessID": BIZ,
            "customerName": "Overflow Systems",
            "email": "ap@overflow.example",
            "paymentChannel": "manual",
            "offeringId": OFFERING_ROW["offeringId"],
        },
        "entitlement": ENTITLEMENT_HIT,
        "existingCustomerIds": ["nw-0007", "nw-0008"],
        "settings": SETTINGS_NO_CONNECT,
        "contract": contract(),
        "tokenMetering": "ok",
        "stripe": {"stripeCustomerId": "cus_unused", "portalUrl": "https://billing.example/unused"},
    },
    {
        "label": "stripe-without-connect",
        "subject": SUBJECT,
        "dto": {
            "businessID": BIZ,
            "customerName": "Meridian Analytics",
            "email": "ap@meridian.example",
            "paymentChannel": "Stripe",
        },
        "entitlement": ENTITLEMENT_OK,
        "existingCustomerIds": ["nw-0007"],
        "settings": SETTINGS_NO_CONNECT,
        "contract": None,
        "tokenMetering": "ok",
        "stripe": {"stripeCustomerId": "cus_unused", "portalUrl": "https://billing.example/unused"},
    },
    {
        "label": "stripe-on-connected-business",
        "subject": SUBJECT,
        "dto": {
            "businessID": BIZ,
            "customerName": "Beacon Robotics",
            "email": "ap@beaconrobotics.example",
            "paymentChannel": "Stripe",
        },
        "entitlement": ENTITLEMENT_OK,
        "existingCustomerIds": ["nw-0007"],
        "settings": SETTINGS_CONNECTED,
        "contract": None,
        "tokenMetering": "ok",
        "stripe": {
            "stripeCustomerId": "cus_QeR8zTn1WkP2Lm",
            "portalUrl": "https://billing.stripe.com/p/session/live_YWNjdF8xUG1RNFo",
        },
    },
    {
        "label": "stripe-caller-brought-its-own-customer",
        "subject": SUBJECT,
        "dto": {
            "businessID": BIZ,
            "customerName": "Ridgeway Freight",
            "email": "ap@ridgeway.example",
            "paymentChannel": "Stripe",
            "paymentChannelOptions": {"stripeCustomerId": "cus_ExIsTiNg4Ridgeway"},
        },
        "entitlement": ENTITLEMENT_OK,
        "existingCustomerIds": ["nw-0007"],
        "settings": SETTINGS_NO_CONNECT,
        "contract": None,
        "tokenMetering": "ok",
        "stripe": {"stripeCustomerId": "cus_should_not_be_used", "portalUrl": "https://billing.example/unused"},
    },
    {
        "label": "offering-with-prepaid-credit",
        "subject": SUBJECT,
        "dto": {
            "businessID": BIZ,
            "customerId": "nw-1043",
            "customerName": "Tidewater Compute",
            "email": "ap@tidewater.example",
            "paymentChannel": "manual",
            "offeringId": OFFERING_ROW["offeringId"],
            "usage": [{"dimensionId": "dim_api_calls", "value": "12000"}],
        },
        "entitlement": ENTITLEMENT_OK,
        "existingCustomerIds": ["nw-0007"],
        "settings": SETTINGS_NO_CONNECT,
        "contract": contract(prepaidCredit="500.00"),
        "tokenMetering": "ok",
        "stripe": {"stripeCustomerId": "cus_unused", "portalUrl": "https://billing.example/unused"},
    },
    {
        "label": "offering-with-free-trial",
        "subject": SUBJECT,
        "dto": {
            "businessID": BIZ,
            "customerId": "nw-1044",
            "customerName": "Larkspur Media",
            "email": "ap@larkspur.example",
            "paymentChannel": "manual",
            "offeringId": OFFERING_ROW["offeringId"],
        },
        "entitlement": ENTITLEMENT_OK,
        "existingCustomerIds": ["nw-0007"],
        "settings": SETTINGS_NO_CONNECT,
        "contract": contract(overridesForOffering={"freeTrialEndDate": "2026-09-12T00:00:00.000Z"}),
        "tokenMetering": "ok",
        "stripe": {"stripeCustomerId": "cus_unused", "portalUrl": "https://billing.example/unused"},
    },
    {
        "label": "offering-without-free-trial",
        "subject": SUBJECT,
        "dto": {
            "businessID": BIZ,
            "customerId": "nw-1045",
            "customerName": "Copperfield Labs",
            "email": "ap@copperfield.example",
            "paymentChannel": "manual",
            "offeringId": OFFERING_ROW["offeringId"],
        },
        "entitlement": ENTITLEMENT_OK,
        "existingCustomerIds": ["nw-0007"],
        "settings": SETTINGS_NO_CONNECT,
        "contract": contract(),
        "tokenMetering": "ok",
        "stripe": {"stripeCustomerId": "cus_unused", "portalUrl": "https://billing.example/unused"},
    },
    {
        "label": "token-metering-unavailable",
        "subject": SUBJECT,
        "dto": {
            "businessID": BIZ,
            "customerId": "nw-1046",
            "customerName": "Ashgrove Foods",
            "email": "ap@ashgrove.example",
            "paymentChannel": "manual",
        },
        "entitlement": ENTITLEMENT_OK,
        "existingCustomerIds": ["nw-0007"],
        "settings": SETTINGS_NO_CONNECT,
        "contract": None,
        "tokenMetering": "throw",
        "stripe": {"stripeCustomerId": "cus_unused", "portalUrl": "https://billing.example/unused"},
    },
    {
        "label": "address-metadata-and-tax",
        "subject": SUBJECT,
        "dto": {
            "businessID": BIZ,
            "customerId": "nw-1047",
            "customerName": "Selkirk Instruments",
            "email": "ap@selkirk.example",
            "paymentChannel": "manual",
            "taxExempt": "exempt",
            "currency": "EUR",
            "metadata": {"segment": "enterprise", "region": "emea"},
            "address": {
                "countryCode": "IE",
                "postalCode": "D02 AF30",
                "city": "Dublin",
                "streetLineOne": "12 Merrion Square",
                "state": "Leinster",
            },
        },
        "entitlement": ENTITLEMENT_OK,
        "existingCustomerIds": ["nw-0007"],
        "settings": SETTINGS_NO_CONNECT,
        "contract": None,
        "tokenMetering": "ok",
        "stripe": {"stripeCustomerId": "cus_unused", "portalUrl": "https://billing.example/unused"},
    },
]

# --------------------------------------------------------------------------
# The sandbox runs. Same generator, a different business, and the outputs the
# reference implementation produced for them are archived in the sandbox
# estate.
#
# One recording per case class the scorer distinguishes, and no more. The
# scorer branches on three refusals plus six independent binary dimensions of
# an accepted onboarding; the three refusals are mutually exclusive and so is
# the payment-rail dimension, which puts the floor at six runs. Each accepted
# run therefore carries several dimensions at once, and the two contract runs
# are deliberately complementary: one brings prepaid credit and no trial, the
# other a trial and no prepaid credit, so neither convention can be read off a
# single row without noticing which input it tracks.
# --------------------------------------------------------------------------

SB_BIZ = "biz_apex"
SB_SUBJECT = "auth0|5f3c1d9be0a74c1b2f8e0d31"
SB_SETTINGS_NO_CONNECT = {
    "businessID": SB_BIZ,
    "accountState": "sandbox",
    "stripeAccountId": "",
    "businessName": "Apex Signals",
    "currency": "USD",
}
SB_SETTINGS_CONNECTED = {
    "businessID": SB_BIZ,
    "accountState": "sandbox",
    "stripeAccountId": "acct_1LqW8TCn0dRfPz2A",
    "businessName": "Apex Signals",
    "currency": "USD",
}
SB_OFFERING = {
    "offeringId": "off_platform_std",
    "offeringName": "Platform Standard",
    "offeringType": "subscription",
    "currency": "USD",
    "dimensions": [],
}


SB_ENTITLEMENT_OK = {"entitlementExceeded": False, "entitlementValue": "40", "currentValue": "17"}
SB_ENTITLEMENT_HIT = {"entitlementExceeded": True, "entitlementValue": "40", "currentValue": "40"}


def sb_contract(**overrides):
    base = {
        "message": "Loaded Contract Points",
        "offering": SB_OFFERING,
        "offeringEnrollmentDate": "2026-07-01T00:00:00.000Z",
        "overridesForOffering": {},
    }
    base.update(overrides)
    return base


SANDBOX_RUNS = [
    # ---- refusal: the plan has no room left for another customer ----------
    # An offeringId rides along so that "nothing was left behind" is a claim
    # about the contract as well as the row.
    {
        "label": "allowance-reached",
        "dto": {
            "businessID": SB_BIZ,
            "customerId": "apx-0461",
            "customerName": "Halewood Freight",
            "email": "ops@halewood-freight.example",
            "paymentChannel": "Manual",
            "offeringId": "off_platform_std",
        },
        "subject": SB_SUBJECT,
        "entitlement": SB_ENTITLEMENT_HIT,
        "existingCustomerIds": ["apx-0119", "apx-0204"],
        "settings": SB_SETTINGS_NO_CONNECT,
        "contract": sb_contract(),
        "tokenMetering": "ok",
        "stripe": {"stripeCustomerId": "cus_unused", "portalUrl": "https://billing.example/unused"},
    },
    # ---- refusal: that identifier is already in use on the business -------
    {
        "label": "identifier-already-in-use",
        "dto": {
            "businessID": SB_BIZ,
            "customerId": "apx-0204",
            "customerName": "Ravensbourne Analytics",
            "email": "billing@ravensbourne.example",
            "paymentChannel": "Manual",
            "offeringId": "off_platform_std",
        },
        "subject": SB_SUBJECT,
        "entitlement": SB_ENTITLEMENT_OK,
        "existingCustomerIds": ["apx-0119", "apx-0204"],
        "settings": SB_SETTINGS_NO_CONNECT,
        "contract": sb_contract(),
        "tokenMetering": "ok",
        "stripe": {"stripeCustomerId": "cus_unused", "portalUrl": "https://billing.example/unused"},
    },
    # ---- refusal: card billing asked for on an unconnected business -------
    {
        "label": "card-without-a-connected-account",
        "dto": {
            "businessID": SB_BIZ,
            "customerName": "Ellesmere Robotics",
            "email": "ap@ellesmere-robotics.example",
            "paymentChannel": "Stripe",
            "offeringId": "off_platform_std",
        },
        "subject": SB_SUBJECT,
        "entitlement": SB_ENTITLEMENT_OK,
        "existingCustomerIds": ["apx-0119", "apx-0204"],
        "settings": SB_SETTINGS_NO_CONNECT,
        "contract": sb_contract(),
        "tokenMetering": "ok",
        "stripe": {"stripeCustomerId": "cus_unused", "portalUrl": "https://billing.example/unused"},
    },
    # ---- accepted: no identifier brought, card rail opened for them -------
    # Carries the generated identifier, the rail customer the platform opens
    # and the id it hands back, the contract and enrolment, prepaid credit
    # opening a balance, a contract with no trial on it, clean metering, and
    # the optional row columns.
    {
        "label": "card-on-a-connected-account",
        "dto": {
            "businessID": SB_BIZ,
            "customerName": "Thornbury Instruments",
            "email": "finance@thornbury-instruments.example",
            "paymentChannel": "Stripe",
            "offeringId": "off_platform_std",
            "customerVatId": "IE9825613N",
            "currency": "EUR",
            "taxExempt": "exempt",
            "address": {
                "countryCode": "IE",
                "postalCode": "D08 X4RN",
                "city": "Dublin",
                "streetLineOne": "3 Grand Canal Quay",
                "state": "Leinster",
            },
            "metadata": {"segment": "instrumentation", "ownerTeam": "emea-mid-market"},
            "usage": [{"dimensionId": "dim_seats", "recordValue": "12"}],
        },
        "subject": SB_SUBJECT,
        "entitlement": SB_ENTITLEMENT_OK,
        "existingCustomerIds": ["apx-0119", "apx-0204"],
        "settings": SB_SETTINGS_CONNECTED,
        "contract": sb_contract(prepaidCredit="1200.00"),
        "tokenMetering": "ok",
        "stripe": {
            "stripeCustomerId": "cus_ApexThornbury01",
            "portalUrl": "https://billing.example/apex/thornbury",
        },
    },
    # ---- accepted: the caller brought their own rail customer ------------
    # Carries a supplied identifier that is free, the caller's rail customer
    # persisted with no new one opened and no portal link handed back, no
    # offering so no contract or enrolment, and metering failing without
    # taking the onboarding down with it.
    {
        "label": "card-with-an-existing-rail-customer",
        "dto": {
            "businessID": SB_BIZ,
            "customerId": "apx-0512",
            "customerName": "Kilbarrack Logistics",
            "email": "accounts@kilbarrack-logistics.example",
            "paymentChannel": "Stripe",
            "paymentChannelOptions": {"stripeCustomerId": "cus_ApexKilbarrackBYO"},
        },
        "subject": SB_SUBJECT,
        "entitlement": SB_ENTITLEMENT_OK,
        "existingCustomerIds": ["apx-0119", "apx-0204"],
        "settings": SB_SETTINGS_CONNECTED,
        "contract": None,
        "tokenMetering": "throw",
        "stripe": {
            "stripeCustomerId": "cus_ApexShouldNotBeOpened",
            "portalUrl": "https://billing.example/apex/should-not-be-opened",
        },
    },
    # ---- accepted: manual billing onto a contract carrying a trial -------
    # Carries the manual rail leaving no rail column at all, a contract with a
    # trial and no prepaid credit, and the trial's start.
    {
        "label": "manual-with-a-free-trial",
        "dto": {
            "businessID": SB_BIZ,
            "customerId": "apx-0538",
            "customerName": "Portmarnock Media",
            "email": "ap@portmarnock-media.example",
            "paymentChannel": "Manual",
            "offeringId": "off_platform_std",
        },
        "subject": SB_SUBJECT,
        "entitlement": SB_ENTITLEMENT_OK,
        "existingCustomerIds": ["apx-0119", "apx-0204"],
        "settings": SB_SETTINGS_NO_CONNECT,
        "contract": sb_contract(overridesForOffering={"freeTrialEndDate": "2026-09-14T00:00:00.000Z"}),
        "tokenMetering": "ok",
        "stripe": {"stripeCustomerId": "cus_unused", "portalUrl": "https://billing.example/unused"},
    },
]

SERVICE_ENV = {
    "STAGE": "dev",
    "INFLUX_ORG": "meteringco",
    "METERINGCO_URL": "http://localhost:3000",
    "JWT_SECRET": "local-dev-secret",
    "STRIPE_TOKEN": "sk_test_localonly",
    "PROD_STRIPE_TOKEN": "sk_live_localonly",
}


def platform_roles():
    """Two roles that have nothing to do with onboarding, so the estate is not
    a single-purpose fixture."""
    return [
        {
            "name": "meteringco-scraper",
            "trust_policy": {
                "Version": "2012-10-17",
                "Statement": [
                    {
                        "Effect": "Allow",
                        "Principal": {"Service": "ec2.amazonaws.com"},
                        "Action": "sts:AssumeRole",
                    }
                ],
            },
            "attached_policy_arns": [f"arn:aws:iam::{PLATFORM_ACCOUNT}:policy/meteringco-scraper-readonly"],
        },
        {
            "name": "meteringco-invoice-writer",
            "trust_policy": {
                "Version": "2012-10-17",
                "Statement": [
                    {
                        "Effect": "Allow",
                        "Principal": {"Service": "lambda.amazonaws.com"},
                        "Action": "sts:AssumeRole",
                    }
                ],
            },
            "attached_policy_arns": [f"arn:aws:iam::{PLATFORM_ACCOUNT}:policy/meteringco-invoice-writer"],
        },
    ]


def estate(buckets):
    return {
        "region": REGION,
        "bootstrap_identity": {"account_id": PLATFORM_ACCOUNT, "access_key_id": "LOCALMETERINGKEY00"},
        "accounts": [
            {
                "account_id": PLATFORM_ACCOUNT,
                "alias": "meteringco-platform",
                "roles": platform_roles(),
                "policies": [
                    {
                        "arn": f"arn:aws:iam::{PLATFORM_ACCOUNT}:policy/meteringco-scraper-readonly",
                        "document": {
                            "Version": "2012-10-17",
                            "Statement": [{"Effect": "Allow", "Action": ["ce:GetCostAndUsage"], "Resource": "*"}],
                        },
                    }
                ],
                "buckets": buckets,
            }
        ],
    }


# What an archived record says about the run. The inputs stay, because an
# output nobody can attribute to an input teaches nothing. Of the outputs only
# what left the service is kept: the row it persisted, what it announced, what
# it reported as failed, and what it handed back.
#
# The arguments it passed its own collaborators are deliberately not archived.
# Every one of them is recoverable from code that survives in the tree — the
# entitlement enum and its sibling gate, the signatures of getLatestCustomer,
# SettingsService.findAll and the surviving createStripeCustomer, the fields of
# CreateContractDto, the enrolment call site in contract.service.ts and the two
# sibling metering blocks — so archiving them would hand over a call transcript
# to copy in place of a convention to derive.
ARCHIVED_OUTCOME_FIELDS = (
    "ok",
    "error",
    "startedAt",
    "finishedAt",
    "response",
    "influxWrites",
    "webhookEvents",
    "auditEvents",
)


def archive_objects(recorded):
    """The month's provisioning records, one object per onboarding.

    Each row pairs the request and the state it met with what the reference
    implementation persisted, announced and handed back, so the shape of a
    provisioned customer is observable in the sandbox without any access to the
    graded requests.
    """
    if not recorded:
        return []
    runs = recorded.get("runs", {})
    by_label = {run["label"]: run for run in SANDBOX_RUNS}
    objects = []
    for index, run in enumerate(SANDBOX_RUNS):
        label = run["label"]
        if label not in runs:
            continue
        source = by_label[label]
        observed = runs[label]
        row = {
            "request": source["dto"],
            "subject": source["subject"],
            "customerAllowance": source["entitlement"],
            "customerIdsAlreadyOnTheBusiness": source["existingCustomerIds"],
            "businessSettings": source["settings"],
            "contractReturned": source["contract"],
            "tokenMetering": source["tokenMetering"],
            "outcome": {
                field: observed[field] for field in ARCHIVED_OUTCOME_FIELDS if field in observed
            },
        }
        objects.append(
            {
                "key": f"customer-provisioning/2026-08/{label}.ndjson",
                "body_ndjson": [row],
                "metadata": {"content-type": "application/x-ndjson"},
            }
        )
    return objects


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--recorded",
        help="observations the reference implementation produced for the sandbox runs; "
        "folded into the sandbox estate as the archived month of output",
    )
    args = parser.parse_args()

    recorded = None
    if args.recorded:
        # Stack traces carry the path the recording was made under. Nothing
        # outside the container should be visible from inside it.
        blob = Path(args.recorded).read_text()
        blob = re.sub(r"(/[A-Za-z0-9._-]+)+/(top-up-billing-lifecycle|oracle|workspace)/", "/app/", blob)
        blob = re.sub(r"/(Users|home|root)/[A-Za-z0-9._-]+(/[A-Za-z0-9._-]+)*", "/app", blob)
        recorded = json.loads(blob)

    sandbox_dir = HERE / "sandbox"
    verifier_dir = HERE / "verifier-data"
    sandbox_dir.mkdir(exist_ok=True)
    verifier_dir.mkdir(exist_ok=True)

    sandbox = estate(
        [
            {
                "name": RECORD_BUCKET,
                "versioning": "Enabled",
                "encryption": "AES256",
                "objects": archive_objects(recorded),
            },
            {"name": OBSERVATION_BUCKET, "objects": []},
        ]
    )
    (sandbox_dir / "public.json").write_text(json.dumps(sandbox, indent=1) + "\n")

    holdout = estate([{"name": OBSERVATION_BUCKET, "objects": []}])
    (verifier_dir / "holdout.json").write_text(json.dumps(holdout, indent=1) + "\n")

    (verifier_dir / "run-spec.json").write_text(
        json.dumps(
            {
                "environment": SERVICE_ENV,
                "observationBucket": OBSERVATION_BUCKET,
                "runs": HOLDOUT_RUNS,
            },
            indent=1,
        )
        + "\n"
    )

    (HERE / "sandbox-run-spec.json").write_text(
        json.dumps(
            {
                "environment": SERVICE_ENV,
                "observationBucket": OBSERVATION_BUCKET,
                "runs": SANDBOX_RUNS,
            },
            indent=1,
        )
        + "\n"
    )

    print(f"sandbox estate      {sandbox_dir / 'public.json'}")
    print(f"held-out estate     {verifier_dir / 'holdout.json'}")
    print(f"graded runs         {verifier_dir / 'run-spec.json'} ({len(HOLDOUT_RUNS)} runs)")
    print(f"sandbox runs        {HERE / 'sandbox-run-spec.json'} ({len(SANDBOX_RUNS)} runs)")


if __name__ == "__main__":
    main()
