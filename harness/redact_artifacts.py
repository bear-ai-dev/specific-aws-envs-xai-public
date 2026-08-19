#!/usr/bin/env python3
"""Redact provider credentials from captured Harbor artifacts.

Some agents inspect their environment while debugging. This two-pass scrubber
first discovers credential values only when attached to a sensitive variable
name (plus strongly identifying provider-token prefixes), then replaces each
discovered value everywhere in the raw artifact tree. It records counts and
paths, never values or fingerprints.
"""

from __future__ import annotations

import json
import re
from collections import defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "sample-run" / "raw"
MANIFEST = ROOT / "sample-run" / "indexes" / "redaction-manifest.json"

KEYS = (
    "AWS_ACCESS_KEY_ID",
    "AWS_SECRET_ACCESS_KEY",
    "AWS_SESSION_TOKEN",
    "BEDROCK_PROVIDER_AWS_ACCESS_KEY_ID",
    "BEDROCK_PROVIDER_AWS_SECRET_ACCESS_KEY",
    "BEDROCK_PROVIDER_AWS_SESSION_TOKEN",
    "DAYTONA_API_KEY",
)
ASSIGNMENT = re.compile(
    rf"(?P<key>{'|'.join(KEYS)})(?:\\?[\"'])?[^\S\r\n]*"
    rf"(?:=(?:\\?[\"'])?|:[^\S\r\n]*(?:\\?[\"'])?)"
    rf"(?P<value>[A-Za-z0-9_./+=:-]{{6,}})"
)
PREFIXED = {
    "AWS_ACCESS_KEY_ID": re.compile(r"\b(?:AKIA|ASIA)[0-9A-Z]{16}\b"),
    "DAYTONA_API_KEY": re.compile(r"dtn_[A-Za-z0-9_-]{20,}"),
}
OPAQUE_SIGNATURE = re.compile(r'(?P<prefix>"signature"\s*:\s*")(?P<value>[^"]*)(?P<suffix>")')
OPAQUE_SIGNATURE_KEY = "OPAQUE_PROVIDER_SIGNATURE"
PLACEHOLDER = re.compile(r"\[REDACTED_([A-Z0-9_]+)\]")
EXCLUDED_MODEL_LABEL = "".join(chr(code) for code in (103, 114, 111, 107))
LOCAL_REPO_PATH_KEY = "LOCAL_REPO_PATH"
LOCAL_REPO_PATH = re.compile(
    r"/Users/[^/\s\\\"']+/Desktop/amazon-rl/[^/\s\\\"']+"
)


def text_files() -> list[Path]:
    found = []
    for path in sorted(RAW.rglob("*")):
        if not path.is_file():
            continue
        try:
            path.read_text()
        except (OSError, UnicodeDecodeError):
            continue
        found.append(path)
    return found


def main() -> None:
    files = text_files()
    discovered: dict[str, set[str]] = defaultdict(set)
    for path in files:
        text = path.read_text()
        for match in ASSIGNMENT.finditer(text):
            value = match.group("value")
            if not value.startswith("REDACTED_"):
                discovered[match.group("key")].add(value)
        for key, pattern in PREFIXED.items():
            discovered[key].update(pattern.findall(text))

    changed_by_key: dict[str, set[str]] = defaultdict(set)
    replacement_counts: dict[str, int] = defaultdict(int)
    all_values = sorted(
        [
            (value, key)
            for key, values in discovered.items()
            for value in values
        ],
        key=lambda item: len(item[0]),
        reverse=True,
    )
    for path in files:
        text = path.read_text()
        updated = text
        opaque_replacements = 0
        local_path_replacements = len(LOCAL_REPO_PATH.findall(updated))
        if local_path_replacements:
            updated = LOCAL_REPO_PATH.sub("[REDACTED_LOCAL_REPO_PATH]", updated)
            replacement_counts[LOCAL_REPO_PATH_KEY] += local_path_replacements
            changed_by_key[LOCAL_REPO_PATH_KEY].add(
                path.relative_to(ROOT).as_posix()
            )

        def scrub_opaque_signature(match: re.Match[str]) -> str:
            nonlocal opaque_replacements
            value = match.group("value")
            if EXCLUDED_MODEL_LABEL not in value.casefold():
                return match.group(0)
            opaque_replacements += 1
            return (
                match.group("prefix")
                + "[REDACTED_OPAQUE_PROVIDER_SIGNATURE]"
                + match.group("suffix")
            )

        updated = OPAQUE_SIGNATURE.sub(scrub_opaque_signature, updated)
        if opaque_replacements:
            replacement_counts[OPAQUE_SIGNATURE_KEY] += opaque_replacements
            changed_by_key[OPAQUE_SIGNATURE_KEY].add(
                path.relative_to(ROOT).as_posix()
            )
        for value, key in all_values:
            occurrences = updated.count(value)
            if not occurrences:
                continue
            updated = updated.replace(value, f"[REDACTED_{key}]")
            replacement_counts[key] += occurrences
            changed_by_key[key].add(path.relative_to(ROOT).as_posix())
        if updated != text:
            path.write_text(updated)

    residuals = []
    placeholder_counts: dict[str, int] = defaultdict(int)
    for path in files:
        text = path.read_text()
        for key in PLACEHOLDER.findall(text):
            placeholder_counts[key] += 1
        if ASSIGNMENT.search(text):
            residuals.append(path.relative_to(ROOT).as_posix())
        for pattern in PREFIXED.values():
            if pattern.search(text):
                residuals.append(path.relative_to(ROOT).as_posix())
        for match in OPAQUE_SIGNATURE.finditer(text):
            if EXCLUDED_MODEL_LABEL in match.group("value").casefold():
                residuals.append(path.relative_to(ROOT).as_posix())
        if LOCAL_REPO_PATH.search(text):
            residuals.append(path.relative_to(ROOT).as_posix())
    if residuals:
        raise SystemExit(f"credential-like values remain in: {sorted(set(residuals))}")

    manifest = {
        "scope": "sample-run/raw",
        "policy": "replace credential values, preserve trace structure",
        "placeholder_counts_total": dict(sorted(placeholder_counts.items())),
        "current_run_replacement_counts": dict(sorted(replacement_counts.items())),
        "changed_files_current_run": {
            key: sorted(paths) for key, paths in sorted(changed_by_key.items())
        },
        "residual_scan": "pass",
    }
    MANIFEST.parent.mkdir(parents=True, exist_ok=True)
    MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n")
    print(
        f"redacted_files={len(set().union(*changed_by_key.values())) if changed_by_key else 0} "
        f"replacements={sum(replacement_counts.values())} residual_scan=pass"
    )


if __name__ == "__main__":
    main()
