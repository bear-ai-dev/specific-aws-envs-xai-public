#!/usr/bin/env python3
"""Redact linkable execution-infrastructure IDs from added review bundles."""

from __future__ import annotations

import re
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
BUNDLES = (
    ROOT / "sample-run" / "review-bundle" / "07-multi-region-sweep",
    ROOT / "sample-run" / "review-bundle" / "14-iam-role-validation",
    ROOT / "sample-run" / "review-bundle" / "27-tax-jurisdiction",
)
INFRA_KEYS = (
    "DAYTONA_ORGANIZATION_ID",
    "DAYTONA_SANDBOX_ID",
    "DAYTONA_SANDBOX_SNAPSHOT",
)
ASSIGNMENT = re.compile(
    rf"(?P<key>{'|'.join(INFRA_KEYS)})=(?P<value>[^\s\\\"']+)"
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
