#!/bin/bash
# Functional verification without Docker.
#
# Mirrors tests/test.sh: brings up the held-out tax authority on a private port,
# drives a candidate tree through the trusted driver, reads the authority's log
# over the admin channel, and scores with the same root scorer. Takes the tree to
# grade as its first argument.
#
#   scripts/local-verify.sh pristine            # the reference implementation
#   scripts/local-verify.sh environment/workspace  # the gutted starting point
set -uo pipefail

TASK_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TREE="${1:?usage: local-verify.sh <tree> [label]}"
LABEL="${2:-$(basename "$TREE")}"
PORT="${PORT:-4577}"

# The image runs node 22. Point NODE22_BIN at a matching toolchain so a local
# run exercises the same runtime; newer majors drop APIs this dependency tree
# still uses and fail for reasons the container never sees.
if [ -n "${NODE22_BIN:-}" ]; then
    PATH="$NODE22_BIN:$PATH"
fi

case "$TREE" in
    /*) TREE_ABS="$TREE" ;;
    *) TREE_ABS="$TASK_DIR/$TREE" ;;
esac

VERIFIER_DATA="$TASK_DIR/environment/verifier-data"
RUN_DIR="$(mktemp -d)"
OBSERVED="$RUN_DIR/observed.json"
SNAPSHOT="$RUN_DIR/snapshot.json"
OUT_DIR="$TASK_DIR/.verify/$LABEL"
mkdir -p "$OUT_DIR"

cleanup() {
    [ -n "${SERVER_PID:-}" ] && kill "$SERVER_PID" 2>/dev/null
    rm -f "$TREE_ABS/.verifier-drive.ts"
    rm -rf "$RUN_DIR"
}
trap cleanup EXIT

for pid in $(lsof -nP -iTCP:"$PORT" -sTCP:LISTEN -t 2>/dev/null); do
    kill -9 "$pid" 2>/dev/null
done

ADMIN_TOKEN="$(head -c 18 /dev/urandom | od -An -tx1 | tr -d ' \n')"

MOCKAWS_ADMIN_TOKEN="$ADMIN_TOKEN" PYTHONPATH="$TASK_DIR/environment" python3 -m mockaws \
    --scenario "$VERIFIER_DATA/holdout.json" --host 127.0.0.1 --port "$PORT" --seed 41 \
    > "$OUT_DIR/mockaws.log" 2>&1 &
SERVER_PID=$!

ready=0
for _ in $(seq 1 60); do
    if curl -s --max-time 2 -H "x-mockaws-admin-token: ${ADMIN_TOKEN}" \
        "http://127.0.0.1:${PORT}/_admin/health" | grep -q '"ok":true'; then
        ready=1
        break
    fi
    sleep 0.5
done
if [ "$ready" != "1" ]; then
    echo "tax authority failed to start"
    cat "$OUT_DIR/mockaws.log"
    exit 1
fi

DRIVER_CONFIG="$(python3 - "$VERIFIER_DATA/run-spec.json" "$OBSERVED" <<'PY'
import json, sys

spec = json.load(open(sys.argv[1]))
print(json.dumps({"cases": spec["cases"], "out": sys.argv[2]}))
PY
)"

cp "$VERIFIER_DATA/drive.ts" "$TREE_ABS/.verifier-drive.ts"
(
    cd "$TREE_ABS" && env -i \
        PATH="$PATH" \
        HOME="$HOME" \
        TZ=Etc/UTC \
        NODE_OPTIONS=--max-old-space-size=2048 \
        TAX_JAR_URL="http://127.0.0.1:${PORT}/taxjar/sandbox" \
        PROD_TAX_JAR_URL="http://127.0.0.1:${PORT}/taxjar/production" \
        INFLUX_URL="http://127.0.0.1:${PORT}/influx" \
        INFLUX_ORG=meteringco \
        INFLUX_TOKEN=local \
        STAGE=dev \
        tsx .verifier-drive.ts "$DRIVER_CONFIG"
) > "$OUT_DIR/driver.log" 2>&1
echo "driver diagnostic exit: $?"

curl -s --max-time 30 -H "x-mockaws-admin-token: ${ADMIN_TOKEN}" \
    "http://127.0.0.1:${PORT}/_admin/snapshot" -o "$SNAPSHOT"

python3 "$TASK_DIR/tests/compute_reward.py" \
    --output-dir "$OUT_DIR" \
    --scenario "$VERIFIER_DATA/holdout.json" \
    --spec "$VERIFIER_DATA/run-spec.json" \
    --countries "$VERIFIER_DATA/countryLookup.json" \
    --observed "$OBSERVED" \
    --snapshot "$SNAPSHOT"

cp -a "$OBSERVED" "$OUT_DIR/observed.json" 2>/dev/null
cp -a "$SNAPSHOT" "$OUT_DIR/snapshot.json" 2>/dev/null
