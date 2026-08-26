"""EC2 (query protocol): instances, reserved instances, instance types."""

from __future__ import annotations

from ..state import Session, World, iso
from ..wire import (
    XMLNS_EC2,
    Request,
    Response,
    credential_region,
    error_ec2,
    flatten_members,
    flatten_structs,
    query_action,
    tag,
    xml_response,
)

# Actions that address resources inside one region. `DescribeRegions` is not
# among them: it is how a caller finds out which regions exist in the first
# place, so it answers from anywhere.
REGIONAL_ACTIONS = {
    "DescribeInstances",
    "DescribeVolumes",
    "DescribeSnapshots",
    "DescribeSubnets",
    "DescribeReservedInstances",
    "DescribeInstanceTypes",
    "CreateTags",
}

# Only the shapes the tasks need; enough to bin-pack against.
INSTANCE_TYPES: dict[str, dict[str, float]] = {
    "t3.small": {"vcpu": 2, "memory_gib": 2.0, "max_pods": 11},
    "t3.medium": {"vcpu": 2, "memory_gib": 4.0, "max_pods": 17},
    "t3.large": {"vcpu": 2, "memory_gib": 8.0, "max_pods": 35},
    "t3.xlarge": {"vcpu": 4, "memory_gib": 16.0, "max_pods": 58},
    "m5.large": {"vcpu": 2, "memory_gib": 8.0, "max_pods": 29},
    "m5.xlarge": {"vcpu": 4, "memory_gib": 16.0, "max_pods": 58},
    "m5.2xlarge": {"vcpu": 8, "memory_gib": 32.0, "max_pods": 58},
    "m6i.large": {"vcpu": 2, "memory_gib": 8.0, "max_pods": 29},
    "m6i.xlarge": {"vcpu": 4, "memory_gib": 16.0, "max_pods": 58},
    "m6i.2xlarge": {"vcpu": 8, "memory_gib": 32.0, "max_pods": 58},
    "m6i.4xlarge": {"vcpu": 16, "memory_gib": 64.0, "max_pods": 234},
    "c6i.large": {"vcpu": 2, "memory_gib": 4.0, "max_pods": 29},
    "c6i.xlarge": {"vcpu": 4, "memory_gib": 8.0, "max_pods": 58},
    "c6i.2xlarge": {"vcpu": 8, "memory_gib": 16.0, "max_pods": 58},
    "c6i.4xlarge": {"vcpu": 16, "memory_gib": 32.0, "max_pods": 234},
    "r6i.large": {"vcpu": 2, "memory_gib": 16.0, "max_pods": 29},
    "r6i.xlarge": {"vcpu": 4, "memory_gib": 32.0, "max_pods": 58},
    "r6i.2xlarge": {"vcpu": 8, "memory_gib": 64.0, "max_pods": 58},
    "r6i.4xlarge": {"vcpu": 16, "memory_gib": 128.0, "max_pods": 234},
}


def _envelope(action: str, inner: str) -> Response:
    body = (
        f'<{action}Response xmlns="{XMLNS_EC2}">'
        "<requestId>mockaws-ec2</requestId>"
        f"{inner}"
        f"</{action}Response>"
    )
    return xml_response(body)


def _filters(form: dict[str, str]) -> dict[str, list[str]]:
    out: dict[str, list[str]] = {}
    index = 1
    while True:
        name = form.get(f"Filter.{index}.Name")
        if name is None:
            break
        values = flatten_members(form, f"Filter.{index}.Value")
        out[name] = values
        index += 1
    return out


def _instance_matches(instance, filters: dict[str, list[str]]) -> bool:
    for name, values in filters.items():
        if name == "instance-state-name":
            if instance.state not in values:
                return False
        elif name == "instance-type":
            if instance.instance_type not in values:
                return False
        elif name == "tag-key":
            if not any(key in instance.tags for key in values):
                return False
        elif name.startswith("tag:"):
            key = name[4:]
            if instance.tags.get(key) not in values:
                return False
        elif name == "availability-zone":
            if instance.availability_zone not in values:
                return False
    return True


def _tag_matches(resource, filters: dict[str, list[str]]) -> bool:
    """The subset of EC2 filters volumes and snapshots are queried with here."""
    for name, values in filters.items():
        if name.startswith("tag:"):
            if resource.tags.get(name[4:]) not in values:
                return False
        elif name == "tag-key":
            if not any(key in resource.tags for key in values):
                return False
        elif name == "status":
            if resource.state not in values:
                return False
        elif name == "volume-id":
            if resource.volume_id not in values:
                return False
        elif name == "availability-zone":
            if getattr(resource, "availability_zone", None) not in values:
                return False
    return True


def _subnet_matches(subnet, filters: dict[str, list[str]]) -> bool:
    for name, values in filters.items():
        if name == "subnet-id":
            if subnet.subnet_id not in values:
                return False
        elif name == "availability-zone":
            if subnet.availability_zone not in values:
                return False
        elif name == "vpc-id":
            if subnet.vpc_id not in values:
                return False
        elif name == "state":
            if subnet.state not in values:
                return False
        elif name.startswith("tag:"):
            key = name[4:]
            if subnet.tags.get(key) not in values:
                return False
    return True


def handle(world: World, req: Request, injector, caller: Session | None) -> Response:
    if caller is None:
        return error_ec2("AuthFailure", "AWS was not able to validate the provided access credentials", 403)
    account = world.account(caller.account_id)
    if account is None:
        return error_ec2("AuthFailure", "Unknown account", 403)

    action = query_action(req)
    form = req.form()
    region_name = credential_region(req.headers) or world.region
    region = world.region_named(region_name)

    if action in REGIONAL_ACTIONS:
        # A region the account has never switched on rejects the credentials
        # outright; that is what makes it visible as out of scope rather than
        # simply empty.
        if region is not None and not region.enabled:
            return error_ec2(
                "AuthFailure",
                f"AWS was not able to validate the provided access credentials for {region_name}",
                401,
            )
        if region is not None:
            fault = region.faults.get(action)
            if fault is not None and fault.take():
                return error_ec2(fault.code, fault.message, fault.status)

    if action == "DescribeRegions":
        all_regions = form.get("AllRegions", "false").lower() == "true"
        wanted_names = set(flatten_members(form, "RegionName"))
        entries = []
        for name in sorted(world.regions):
            declared = world.regions[name]
            if wanted_names and name not in wanted_names:
                continue
            if not all_regions and not declared.enabled:
                continue
            entries.append(
                "<item>"
                f"{tag('regionName', declared.name)}"
                f"{tag('regionEndpoint', declared.endpoint)}"
                f"{tag('optInStatus', declared.opt_in_status)}"
                "</item>"
            )
        return _envelope("DescribeRegions", f"<regionInfo>{''.join(entries)}</regionInfo>")

    if action == "DescribeVolumes":
        filters = _filters(form)
        wanted = set(flatten_members(form, "VolumeId"))
        requested = int(form.get("MaxResults", "1000"))
        page_size = injector.page_size("ec2", "DescribeVolumes", requested)
        token = form.get("NextToken", "")

        matching = [
            volume
            for volume in sorted(account.volumes.values(), key=lambda v: v.volume_id)
            if volume.region == region_name
            and (not wanted or volume.volume_id in wanted)
            and _tag_matches(volume, filters)
        ]
        start = 0
        if token:
            start = next((i for i, vol in enumerate(matching) if vol.volume_id > token), len(matching))
        page = matching[start : start + page_size]
        truncated = start + page_size < len(matching)

        entries = []
        for volume in page:
            tags = "".join(
                f"<item>{tag('key', k)}{tag('value', v)}</item>" for k, v in sorted(volume.tags.items())
            )
            entries.append(
                "<item>"
                f"{tag('volumeId', volume.volume_id)}"
                f"{tag('size', volume.size)}"
                f"{tag('status', volume.state)}"
                f"{tag('createTime', iso(volume.create_time))}"
                f"{tag('availabilityZone', volume.availability_zone)}"
                f"{tag('volumeType', volume.volume_type)}"
                f"{tag('iops', volume.iops)}"
                f"{tag('throughput', volume.throughput)}"
                f"{tag('encrypted', 'true' if volume.encrypted else 'false')}"
                f"{tag('multiAttachEnabled', 'false')}"
                "<attachmentSet/>"
                f"<tagSet>{tags}</tagSet>"
                "</item>"
            )
        next_token = tag("nextToken", page[-1].volume_id) if truncated and page else ""
        return _envelope("DescribeVolumes", f"<volumeSet>{''.join(entries)}</volumeSet>{next_token}")

    if action == "DescribeSnapshots":
        filters = _filters(form)
        wanted = set(flatten_members(form, "SnapshotId"))
        requested = int(form.get("MaxResults", "1000"))
        page_size = injector.page_size("ec2", "DescribeSnapshots", requested)
        token = form.get("NextToken", "")

        matching = [
            snapshot
            for snapshot in sorted(account.snapshots.values(), key=lambda s: s.snapshot_id)
            if snapshot.region == region_name
            and (not wanted or snapshot.snapshot_id in wanted)
            and _tag_matches(snapshot, filters)
        ]
        start = 0
        if token:
            start = next(
                (i for i, snap in enumerate(matching) if snap.snapshot_id > token), len(matching)
            )
        page = matching[start : start + page_size]
        truncated = start + page_size < len(matching)

        entries = []
        for snapshot in page:
            tags = "".join(
                f"<item>{tag('key', k)}{tag('value', v)}</item>" for k, v in sorted(snapshot.tags.items())
            )
            entries.append(
                "<item>"
                f"{tag('snapshotId', snapshot.snapshot_id)}"
                f"{tag('volumeId', snapshot.volume_id)}"
                f"{tag('status', snapshot.state)}"
                f"{tag('startTime', iso(snapshot.start_time))}"
                f"{tag('volumeSize', snapshot.volume_size)}"
                f"{tag('ownerId', account.account_id)}"
                f"{tag('storageTier', snapshot.storage_tier)}"
                f"{tag('encrypted', 'true' if snapshot.encrypted else 'false')}"
                f"{tag('description', snapshot.description)}"
                f"<tagSet>{tags}</tagSet>"
                "</item>"
            )
        next_token = tag("nextToken", page[-1].snapshot_id) if truncated and page else ""
        return _envelope("DescribeSnapshots", f"<snapshotSet>{''.join(entries)}</snapshotSet>{next_token}")

    if action == "DescribeInstances":
        filters = _filters(form)
        wanted = set(flatten_members(form, "InstanceId"))
        requested = int(form.get("MaxResults", "1000"))
        page_size = injector.page_size("ec2", "DescribeInstances", requested)
        token = form.get("NextToken", "")

        matching = [
            instance
            for instance in sorted(account.instances.values(), key=lambda i: i.instance_id)
            if instance.region == region_name
            and (not wanted or instance.instance_id in wanted)
            and _instance_matches(instance, filters)
        ]
        start = 0
        if token:
            start = next((i for i, inst in enumerate(matching) if inst.instance_id > token), len(matching))
        page = matching[start : start + page_size]
        truncated = start + page_size < len(matching)

        reservations = []
        for instance in page:
            tags = "".join(
                f"<item>{tag('key', k)}{tag('value', v)}</item>" for k, v in sorted(instance.tags.items())
            )
            lifecycle = tag("instanceLifecycle", "spot") if instance.lifecycle == "spot" else ""
            reservations.append(
                "<item>"
                f"{tag('reservationId', 'r-' + instance.instance_id[2:])}"
                f"{tag('ownerId', account.account_id)}"
                "<instancesSet><item>"
                f"{tag('instanceId', instance.instance_id)}"
                f"{tag('instanceType', instance.instance_type)}"
                f"{tag('launchTime', iso(instance.launch_time))}"
                f"<instanceState>{tag('name', instance.state)}</instanceState>"
                f"<placement>{tag('availabilityZone', instance.availability_zone)}</placement>"
                f"{tag('privateIpAddress', instance.private_ip)}"
                f"{tag('privateDnsName', 'ip-' + instance.private_ip.replace('.', '-') + '.ec2.internal')}"
                f"{tag('platformDetails', instance.platform_details)}"
                f"<cpuOptions>{tag('coreCount', int(INSTANCE_TYPES.get(instance.instance_type, {}).get('vcpu', 2)))}"
                f"{tag('threadsPerCore', 2)}</cpuOptions>"
                f"{lifecycle}"
                f"<tagSet>{tags}</tagSet>"
                "</item></instancesSet>"
                "</item>"
            )
        next_token = tag("nextToken", page[-1].instance_id) if truncated and page else ""
        return _envelope("DescribeInstances", f"<reservationSet>{''.join(reservations)}</reservationSet>{next_token}")

    if action == "DescribeSubnets":
        wanted = set(flatten_members(form, "SubnetId"))
        filters = _filters(form)
        requested = int(form.get("MaxResults", "1000"))
        page_size = injector.page_size("ec2", "DescribeSubnets", requested)
        token = form.get("NextToken", "")

        matching = [
            subnet
            for subnet in sorted(account.subnets.values(), key=lambda s: s.subnet_id)
            if (not wanted or subnet.subnet_id in wanted) and _subnet_matches(subnet, filters)
        ]
        start = 0
        if token:
            start = next(
                (i for i, sub in enumerate(matching) if sub.subnet_id > token), len(matching)
            )
        page = matching[start : start + page_size]
        truncated = start + page_size < len(matching)

        entries = []
        for subnet in page:
            tags = "".join(
                f"<item>{tag('key', k)}{tag('value', v)}</item>" for k, v in sorted(subnet.tags.items())
            )
            entries.append(
                "<item>"
                f"{tag('subnetId', subnet.subnet_id)}"
                f"{tag('availabilityZone', subnet.availability_zone)}"
                f"{tag('availabilityZoneId', subnet.availability_zone_id)}"
                f"{tag('vpcId', subnet.vpc_id)}"
                f"{tag('cidrBlock', subnet.cidr_block)}"
                f"{tag('availableIpAddressCount', subnet.available_ip_address_count)}"
                f"{tag('state', subnet.state)}"
                f"{tag('ownerId', account.account_id)}"
                f"<tagSet>{tags}</tagSet>"
                "</item>"
            )
        next_token = tag("nextToken", page[-1].subnet_id) if truncated and page else ""
        return _envelope("DescribeSubnets", f"<subnetSet>{''.join(entries)}</subnetSet>{next_token}")

    if action == "DescribeReservedInstances":
        entries = []
        for ri in account.reserved_instances:
            entries.append(
                "<item>"
                f"{tag('reservedInstancesId', ri.reserved_instances_id)}"
                f"{tag('instanceType', ri.instance_type)}"
                f"{tag('availabilityZone', ri.availability_zone)}"
                f"{tag('instanceCount', ri.instance_count)}"
                f"{tag('start', iso(ri.start))}{tag('end', iso(ri.end))}"
                f"{tag('offeringClass', ri.offering_class)}{tag('scope', ri.scope)}"
                f"{tag('fixedPrice', ri.fixed_price)}{tag('usagePrice', ri.usage_price)}"
                f"{tag('state', 'active')}"
                "</item>"
            )
        return _envelope(
            "DescribeReservedInstances", f"<reservedInstancesSet>{''.join(entries)}</reservedInstancesSet>"
        )

    if action == "DescribeInstanceTypes":
        wanted = set(flatten_members(form, "InstanceType")) or set(INSTANCE_TYPES)
        entries = []
        for name in sorted(wanted):
            spec = INSTANCE_TYPES.get(name)
            if spec is None:
                continue
            entries.append(
                "<item>"
                f"{tag('instanceType', name)}"
                f"<vCpuInfo>{tag('defaultVCpus', int(spec['vcpu']))}</vCpuInfo>"
                f"<memoryInfo>{tag('sizeInMiB', int(spec['memory_gib'] * 1024))}</memoryInfo>"
                "</item>"
            )
        return _envelope("DescribeInstanceTypes", f"<instanceTypeSet>{''.join(entries)}</instanceTypeSet>")

    if action == "CreateTags":
        resources = flatten_members(form, "ResourceId")
        pairs = flatten_structs(form, "Tag")
        for resource_id in resources:
            instance = account.instances.get(resource_id)
            if instance is None:
                continue
            for pair in pairs:
                if "Key" in pair:
                    instance.tags[pair["Key"]] = pair.get("Value", "")
        return _envelope("CreateTags", "<return>true</return>")

    return error_ec2("InvalidAction", f"Unsupported EC2 action: {action}", 400)
