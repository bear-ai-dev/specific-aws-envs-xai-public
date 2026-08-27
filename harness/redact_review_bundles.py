#!/usr/bin/env python3
"""Redact linkable execution-infrastructure IDs from added review bundles."""

from __future__ import annotations

import re
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
BUNDLES = (
    ROOT / "sample-run" / "review-bundle" / "02-multi-region-sweep",
    ROOT / "sample-run" / "review-bundle" / "03-iam-role-validation",
    ROOT / "sample-run" / "review-bundle" / "04-tax-jurisdiction",
    ROOT / "sample-run" / "review-bundle" / "05-network-egress-metering",
    ROOT / "sample-run" / "review-bundle" / "06-api-token-metering",
    ROOT / "sample-run" / "review-bundle" / "07-api-keys-and-environments",
)
INFRA_KEYS = (
    "DAYTONA_ORGANIZATION_ID",
    "DAYTONA_SANDBOX_ID",
    "DAYTONA_SANDBOX_SNAPSHOT",
)
ASSIGNMENT = re.compile(
    rf"(?P<key>{'|'.join(INFRA_KEYS)})=(?P<value>[^\s\\\"']+)"
)

# Real AWS credentials that reached a trajectory when the agent inspected its own
# environment. The task's mock credentials (LOCALMETERINGKEY01 / billing-secret)
# are deliberately left in place: they are part of the published task.
CREDENTIAL_MASK = (
    "<redacted-aws-credential: live at run time, masked for the public sample>"
)
CREDENTIALS = (
    re.compile(r"\b(?:AKIA|ASIA)[0-9A-Z]{16}\b"),
    re.compile(
        r"(?<=AWS_SECRET_ACCESS_KEY=)[A-Za-z0-9/+=]{40}\b"
        r"|(?<=aws_secret_access_key = )[A-Za-z0-9/+=]{40}\b"
    ),
    re.compile(
        r"(?<=AWS_SESSION_TOKEN=)[A-Za-z0-9/+=]{100,}"
        r"|(?<=aws_session_token = )[A-Za-z0-9/+=]{100,}"
    ),
)


def text_files() -> list[Path]:
    files = []
    for bundle in BUNDLES:
        for path in sorted(bundle.rglob("*")):
            if not path.is_file():
                continue
            try:
                path.read_text()
            except (OSError, UnicodeDecodeError):
                continue
            files.append(path)
    return files


def main() -> None:
    files = text_files()
    discovered: dict[str, set[str]] = {key: set() for key in INFRA_KEYS}
    for path in files:
        for match in ASSIGNMENT.finditer(path.read_text()):
            value = match.group("value")
            if value != "<redacted>":
                discovered[match.group("key")].add(value)

    replacements = 0
    changed = 0
    values = sorted(
        (
            (value, key)
            for key, key_values in discovered.items()
            for value in key_values
        ),
        key=lambda item: len(item[0]),
        reverse=True,
    )
    for path in files:
        text = path.read_text()
        updated = text
        for value, _key in values:
            count = updated.count(value)
            if count:
                updated = updated.replace(value, "<redacted>")
                replacements += count
        for pattern in CREDENTIALS:
            updated, n = pattern.subn(CREDENTIAL_MASK, updated)
            replacements += n
        if updated != text:
            path.write_text(updated)
            changed += 1

    residuals = []
    for path in files:
        for match in ASSIGNMENT.finditer(path.read_text()):
            if match.group("value") != "<redacted>":
                residuals.append(path.relative_to(ROOT).as_posix())
    if residuals:
        raise SystemExit(f"infrastructure IDs remain in: {sorted(set(residuals))}")

    print(
        f"review_bundle_infra_redaction files={changed} "
        f"replacements={replacements} residual_scan=pass"
    )


if __name__ == "__main__":
    main()
