#!/usr/bin/env python3
"""Build the mock-AWS scenario documents this task runs against.

Three files come out of here:

  public.json   the estate the sandbox serves. Seven regions, one of them
                never switched on, one that refuses the volume read, one that
                refuses the snapshot read, one that rate limits both, and one
                that is switched on but holds nothing the sweep is looking
                for.

  holdout.json  the estate the verifier serves. Same record kinds and field
                names, different region set, different identifiers, more of
                everything, and the refusals and rate limits sitting on
                different regions and different actions.

  run-spec.json the two sweeps the verifier asks the submission for.

Every case class the grader distinguishes appears in both documents. A hazard
that showed up only at grading time would be author knowledge rather than
difficulty, so the sandbox carries each of them at the same dose.

Both documents are pure functions of the literals below, so `compute_reward.py`
can re-derive the expected coverage from the document itself instead of from a
stored answer key.
"""

from __future__ import annotations

import argparse
import json
import os

BOOTSTRAP_KEY = "LOCALMETERINGKEY07"
ROLE_NAME = "meteringco-metering"

# Short pages on both inventory reads. Walking a token chain is a habit both
# target models already have; this is here so a sweep that ignores the chain
# cannot look right on a tiny estate, not as a source of difficulty.
FAULTS = {
    "enabled": True,
    "rules": [
        {"service": "ec2", "action": "DescribeVolumes", "max_page_size": 3},
        {"service": "ec2", "action": "DescribeSnapshots", "max_page_size": 3},
        {"service": "ec2", "action": "DescribeInstances", "max_page_size": 3},
    ],
}

REFUSED = {
    "code": "UnauthorizedOperation",
    "message": "You are not authorized to perform this operation in this Region",
    "status": 403,
}

# Four refusals and then the region answers. The AWS SDK gives a call three
# attempts unless it is told otherwise, so this is a rate limit a caller rides
# out rather than one it can never get past.
RATE_LIMITED = {
    "code": "RequestLimitExceeded",
    "message": "Request limit exceeded",
    "status": 503,
    "count": 4,
}


def trust_policy(metering_account: str, external_id: str) -> dict:
    return {
        "Version": "2012-10-17",
        "Statement": [
            {
                "Effect": "Allow",
                "Action": "sts:AssumeRole",
                "Principal": {"AWS": f"arn:aws:iam::{metering_account}:root"},
                "Condition": {"StringEquals": {"sts:ExternalId": external_id}},
            }
        ],
    }


def region(name: str, opt_in: str = "opt-in-not-required", faults: dict | None = None) -> dict:
    entry: dict = {"name": name, "opt_in_status": opt_in}
    if faults:
        entry["faults"] = faults
    return entry


def volume(
    volume_id: str,
    region_name: str,
    size: int,
    dimension: str | None,
    customer: str | None = None,
    volume_type: str = "gp3",
    zone_suffix: str = "a",
) -> dict:
    tags: dict[str, str] = {}
    if dimension:
        tags["meteringcoDimensionId"] = dimension
    if customer:
        tags["meteringcoCustomerId"] = customer
    return {
        "volume_id": volume_id,
        "region": region_name,
        "availability_zone": f"{region_name}{zone_suffix}",
        "size": size,
        "volume_type": volume_type,
        "state": "in-use",
        "create_time": "2025-11-14T08:30:00Z",
        "tags": tags,
    }


def snapshot(
    snapshot_id: str,
    region_name: str,
    source_volume: str,
    size: int,
    dimension: str | None,
    customer: str | None = None,
    tier: str = "standard",
) -> dict:
    tags: dict[str, str] = {}
    if dimension:
        tags["meteringcoDimensionId"] = dimension
    if customer:
        tags["meteringcoCustomerId"] = customer
    return {
        "snapshot_id": snapshot_id,
        "region": region_name,
        "volume_id": source_volume,
        "volume_size": size,
        "storage_tier": tier,
        "start_time": "2025-12-02T04:15:00Z",
        "tags": tags,
    }


def metered_account(
    account_id: str,
    external_id: str,
    metering_account: str,
    volumes: list[dict],
    snapshots: list[dict],
) -> dict:
    return {
        "account_id": account_id,
        "alias": f"metered-{account_id[-4:]}",
        "roles": [{"name": ROLE_NAME, "trust_policy": trust_policy(metering_account, external_id)}],
        "volumes": volumes,
        "snapshots": snapshots,
    }


# --------------------------------------------------------------------------
# sandbox
# --------------------------------------------------------------------------

PUBLIC_METERING = "900000000001"
PUBLIC_ACCOUNT = "100000000077"
PUBLIC_EXTERNAL_ID = "orchard-sbx-4f21"
PUBLIC_DIMENSION = "dim-block-storage-sandbox"
PUBLIC_OTHER_DIMENSION = "dim-object-storage-sandbox"


def build_public() -> dict:
    dim = PUBLIC_DIMENSION
    other = PUBLIC_OTHER_DIMENSION

    regions = [
        region("us-east-1"),
        region("eu-west-1"),
        region("eu-central-1"),
        # Switched on, but the volume read is refused outright.
        region("ap-south-1", "opted-in", {"DescribeVolumes": REFUSED}),
        # Switched on, but the snapshot read is refused outright.
        region("ap-northeast-2", "opted-in", {"DescribeSnapshots": REFUSED}),
        # Switched on, and merely slow to let us in.
        region("sa-east-1", "opted-in", {"DescribeVolumes": RATE_LIMITED, "DescribeSnapshots": RATE_LIMITED}),
        # Never switched on. Its resources are in the document and are not
        # this business' concern.
        region("me-south-1", "not-opted-in"),
    ]

    volumes = [
        volume("vol-0sbx0000000000a1", "us-east-1", 120, dim, "cus_wharf"),
        volume("vol-0sbx0000000000a2", "us-east-1", 40, dim, "cus_wharf", volume_type="gp2"),
        volume("vol-0sbx0000000000a3", "us-east-1", 500, other, "cus_wharf"),
        volume("vol-0sbx0000000000b1", "eu-west-1", 80, dim, "cus_wharf"),
        volume("vol-0sbx0000000000b2", "eu-west-1", 80, dim, "cus_thistle"),
        volume("vol-0sbx0000000000b3", "eu-west-1", 200, dim, "cus_thistle", volume_type="io2"),
        volume("vol-0sbx0000000000b4", "eu-west-1", 16, dim, None),
        volume("vol-0sbx0000000000b5", "eu-west-1", 32, dim, "cus_wharf", zone_suffix="b"),
        volume("vol-0sbx0000000000b6", "eu-west-1", 64, None),
        # Switched on, but nothing here carries the dimension being swept.
        volume("vol-0sbx0000000000c1", "eu-central-1", 250, other, "cus_thistle"),
        volume("vol-0sbx0000000000c2", "eu-central-1", 90, None),
        # Behind a refused volume read: present, and unreachable.
        volume("vol-0sbx0000000000d1", "ap-south-1", 300, dim, "cus_thistle"),
        volume("vol-0sbx0000000000d2", "ap-south-1", 60, dim, "cus_wharf"),
        volume("vol-0sbx0000000000e1", "ap-northeast-2", 150, dim, "cus_wharf"),
        volume("vol-0sbx0000000000e2", "ap-northeast-2", 20, dim, "cus_thistle"),
        volume("vol-0sbx0000000000f1", "sa-east-1", 45, dim, "cus_thistle"),
        volume("vol-0sbx0000000000f2", "sa-east-1", 75, dim, "cus_wharf"),
        # In a region the business never switched on.
        volume("vol-0sbx0000000000g1", "me-south-1", 999, dim, "cus_wharf"),
    ]

    snapshots = [
        snapshot("snap-0sbx000000000a1", "us-east-1", "vol-0sbx0000000000a1", 120, dim, "cus_wharf"),
        snapshot("snap-0sbx000000000a2", "us-east-1", "vol-0sbx0000000000a2", 40, dim, "cus_wharf"),
        snapshot("snap-0sbx000000000a3", "us-east-1", "vol-0sbx0000000000a3", 500, other, "cus_wharf"),
        # Switched on, nothing on this dimension.
        snapshot("snap-0sbx000000000b1", "eu-west-1", "vol-0sbx0000000000b1", 80, other, "cus_thistle"),
        snapshot("snap-0sbx000000000b2", "eu-west-1", "vol-0sbx0000000000b2", 80, None),
        snapshot("snap-0sbx000000000c1", "eu-central-1", "vol-0sbx0000000000c1", 250, dim, "cus_thistle"),
        snapshot("snap-0sbx000000000c2", "eu-central-1", "vol-0sbx0000000000c2", 90, dim, "cus_wharf"),
        snapshot(
            "snap-0sbx000000000c3", "eu-central-1", "vol-0sbx0000000000c2", 90, dim, "cus_wharf", tier="archive"
        ),
        snapshot("snap-0sbx000000000c4", "eu-central-1", "vol-0sbx0000000000c1", 250, dim, None),
        snapshot("snap-0sbx000000000d1", "ap-south-1", "vol-0sbx0000000000d1", 300, dim, "cus_thistle"),
        snapshot("snap-0sbx000000000d2", "ap-south-1", "vol-0sbx0000000000d2", 60, dim, "cus_wharf"),
        # Behind a refused snapshot read.
        snapshot("snap-0sbx000000000e1", "ap-northeast-2", "vol-0sbx0000000000e1", 150, dim, "cus_wharf"),
        snapshot("snap-0sbx000000000f1", "sa-east-1", "vol-0sbx0000000000f1", 45, dim, "cus_thistle"),
        snapshot("snap-0sbx000000000f2", "sa-east-1", "vol-0sbx0000000000f2", 75, dim, "cus_wharf"),
        snapshot("snap-0sbx000000000g1", "me-south-1", "vol-0sbx0000000000g1", 999, dim, "cus_wharf"),
    ]

    return {
        "region": "us-east-1",
        "regions": regions,
        "bootstrap_identity": {"account_id": PUBLIC_METERING, "access_key_id": BOOTSTRAP_KEY},
        "accounts": [
            {"account_id": PUBLIC_METERING, "alias": "meteringco-metering"},
            metered_account(PUBLIC_ACCOUNT, PUBLIC_EXTERNAL_ID, PUBLIC_METERING, volumes, snapshots),
        ],
        "faults": FAULTS,
    }


# --------------------------------------------------------------------------
# held-out estate
# --------------------------------------------------------------------------

HOLDOUT_METERING = "900000000009"
HOLDOUT_ACCOUNT = "300000000042"
HOLDOUT_EXTERNAL_ID = "brightwater-hld-9c31"
HOLDOUT_DIMENSION = "dim-block-storage"
HOLDOUT_OTHER_DIMENSION = "dim-object-storage"
HOLDOUT_BUSINESS = "biz-brightwater"


def build_holdout() -> dict:
    dim = HOLDOUT_DIMENSION
    other = HOLDOUT_OTHER_DIMENSION

    regions = [
        region("us-east-1"),
        region("us-west-2"),
        region("eu-west-2"),
        region("eu-north-1", "opted-in", {"DescribeVolumes": REFUSED}),
        region("ap-northeast-1", "opted-in", {"DescribeSnapshots": REFUSED}),
        region("ap-southeast-2", "opted-in", {"DescribeVolumes": RATE_LIMITED}),
        region("ca-central-1", "opted-in", {"DescribeSnapshots": RATE_LIMITED}),
        region("af-south-1", "not-opted-in"),
        region("il-central-1", "not-opted-in"),
    ]

    volumes = [
        volume("vol-0hld0000000000a1", "us-east-1", 512, dim, "cus_kestrel"),
        volume("vol-0hld0000000000a2", "us-east-1", 128, dim, "cus_kestrel", volume_type="gp2"),
        volume("vol-0hld0000000000a3", "us-east-1", 64, dim, None),
        volume("vol-0hld0000000000a4", "us-east-1", 1024, other, "cus_marlin"),
        volume("vol-0hld0000000000b1", "us-west-2", 256, dim, "cus_marlin"),
        volume("vol-0hld0000000000b2", "us-west-2", 32, dim, "cus_marlin", zone_suffix="b"),
        volume("vol-0hld0000000000b3", "us-west-2", 96, dim, "cus_kestrel"),
        volume("vol-0hld0000000000b4", "us-west-2", 8, dim, "cus_juniper"),
        volume("vol-0hld0000000000b5", "us-west-2", 448, dim, "cus_juniper", volume_type="io2"),
        volume("vol-0hld0000000000b6", "us-west-2", 40, dim, None, zone_suffix="c"),
        volume("vol-0hld0000000000b7", "us-west-2", 2048, None),
        # Switched on, nothing on this dimension.
        volume("vol-0hld0000000000c1", "eu-west-2", 300, other, "cus_juniper"),
        volume("vol-0hld0000000000c2", "eu-west-2", 12, None),
        # Behind a refused volume read.
        volume("vol-0hld0000000000d1", "eu-north-1", 700, dim, "cus_kestrel"),
        volume("vol-0hld0000000000d2", "eu-north-1", 24, dim, "cus_marlin"),
        volume("vol-0hld0000000000d3", "eu-north-1", 88, dim, None),
        volume("vol-0hld0000000000e1", "ap-northeast-1", 160, dim, "cus_marlin"),
        volume("vol-0hld0000000000e2", "ap-northeast-1", 20, dim, "cus_juniper"),
        volume("vol-0hld0000000000f1", "ap-southeast-2", 384, dim, "cus_kestrel"),
        volume("vol-0hld0000000000f2", "ap-southeast-2", 48, dim, "cus_juniper"),
        volume("vol-0hld0000000000g1", "ca-central-1", 72, dim, "cus_marlin"),
        # Never switched on.
        volume("vol-0hld0000000000h1", "af-south-1", 900, dim, "cus_kestrel"),
        volume("vol-0hld0000000000h2", "af-south-1", 36, dim, "cus_juniper"),
    ]

    snapshots = [
        snapshot("snap-0hld000000000a1", "us-east-1", "vol-0hld0000000000a1", 512, dim, "cus_kestrel"),
        snapshot("snap-0hld000000000a2", "us-east-1", "vol-0hld0000000000a2", 128, dim, "cus_kestrel"),
        snapshot("snap-0hld000000000a3", "us-east-1", "vol-0hld0000000000a4", 1024, other, "cus_marlin"),
        # Switched on, nothing on this dimension.
        snapshot("snap-0hld000000000b1", "us-west-2", "vol-0hld0000000000b1", 256, other, "cus_marlin"),
        snapshot("snap-0hld000000000b2", "us-west-2", "vol-0hld0000000000b3", 96, None),
        snapshot("snap-0hld000000000c1", "eu-west-2", "vol-0hld0000000000c1", 300, dim, "cus_juniper"),
        snapshot("snap-0hld000000000c2", "eu-west-2", "vol-0hld0000000000c1", 300, dim, "cus_juniper", tier="archive"),
        snapshot("snap-0hld000000000c3", "eu-west-2", "vol-0hld0000000000c2", 12, dim, None),
        snapshot("snap-0hld000000000c4", "eu-west-2", "vol-0hld0000000000c2", 12, dim, "cus_kestrel"),
        snapshot("snap-0hld000000000c5", "eu-west-2", "vol-0hld0000000000c1", 300, dim, "cus_marlin"),
        snapshot("snap-0hld000000000d1", "eu-north-1", "vol-0hld0000000000d1", 700, dim, "cus_kestrel"),
        snapshot("snap-0hld000000000d2", "eu-north-1", "vol-0hld0000000000d2", 24, dim, "cus_marlin"),
        # Behind a refused snapshot read.
        snapshot("snap-0hld000000000e1", "ap-northeast-1", "vol-0hld0000000000e1", 160, dim, "cus_marlin"),
        snapshot("snap-0hld000000000e2", "ap-northeast-1", "vol-0hld0000000000e2", 20, dim, "cus_juniper"),
        snapshot("snap-0hld000000000f1", "ap-southeast-2", "vol-0hld0000000000f1", 384, dim, "cus_kestrel"),
        snapshot("snap-0hld000000000g1", "ca-central-1", "vol-0hld0000000000g1", 72, dim, "cus_marlin"),
        snapshot("snap-0hld000000000g2", "ca-central-1", "vol-0hld0000000000g1", 72, dim, "cus_juniper"),
        # Never switched on.
        snapshot("snap-0hld000000000h1", "af-south-1", "vol-0hld0000000000h1", 900, dim, "cus_kestrel"),
    ]

    return {
        "region": "us-east-1",
        "regions": regions,
        "bootstrap_identity": {"account_id": HOLDOUT_METERING, "access_key_id": BOOTSTRAP_KEY},
        "accounts": [
            {"account_id": HOLDOUT_METERING, "alias": "meteringco-metering"},
            metered_account(HOLDOUT_ACCOUNT, HOLDOUT_EXTERNAL_ID, HOLDOUT_METERING, volumes, snapshots),
        ],
        "faults": FAULTS,
    }


def build_run_spec() -> dict:
    role_arn = f"arn:aws:iam::{HOLDOUT_ACCOUNT}:role/{ROLE_NAME}"
    return {
        "runs": [
            {
                "label": "provisioned-volumes",
                "kind": "volumes",
                "businessID": HOLDOUT_BUSINESS,
                "roleArn": role_arn,
                "externalId": HOLDOUT_EXTERNAL_ID,
                "dimensionId": HOLDOUT_DIMENSION,
            },
            {
                "label": "retained-snapshots",
                "kind": "snapshots",
                "businessID": HOLDOUT_BUSINESS,
                "roleArn": role_arn,
                "externalId": HOLDOUT_EXTERNAL_ID,
                "dimensionId": HOLDOUT_DIMENSION,
            },
        ]
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out-dir", required=True)
    parser.add_argument("--verifier-dir", required=True)
    args = parser.parse_args()

    os.makedirs(args.out_dir, exist_ok=True)
    os.makedirs(args.verifier_dir, exist_ok=True)

    documents = [
        (os.path.join(args.out_dir, "public.json"), build_public()),
        (os.path.join(args.verifier_dir, "holdout.json"), build_holdout()),
        (os.path.join(args.verifier_dir, "run-spec.json"), build_run_spec()),
    ]
    for path, document in documents:
        with open(path, "w", encoding="utf-8") as handle:
            json.dump(document, handle, indent=2, sort_keys=False)
            handle.write("\n")
        print(f"wrote {path}")


if __name__ == "__main__":
    main()
