"""Metrics store emulator speaking enough of the InfluxDB v2 HTTP API.

The service writes every invoice, settings record and customer through Influx,
so a box with nothing listening on `INFLUX_URL` refuses connections on the first
line of any run and gives the agent no way to exercise its work. This accepts
writes, keeps them, and can read them back.

It is deliberately not part of the grade. The verifier's driver intercepts the
client's write path directly, so nothing here is consulted during scoring; it
exists so the service the agent is editing runs.
"""

from __future__ import annotations

import json
import time
from typing import Any

from ..wire import Request, Response

API_PREFIX = "/influx"


def _text(body: str, status: int = 200, content_type: str = "text/csv; charset=utf-8") -> Response:
    return Response(status=status, body=body.encode(), headers={"Content-Type": content_type})


def _json(payload: Any, status: int = 200) -> Response:
    return Response(
        status=status,
        body=json.dumps(payload, separators=(",", ":")).encode(),
        headers={"Content-Type": "application/json"},
    )


def _parse_line(line: str) -> dict[str, Any] | None:
    """One line of line protocol: `measurement,tag=v field=v timestamp`."""
    line = line.strip()
    if not line or line.startswith("#"):
        return None
    head, _, rest = line.partition(" ")
    if not head:
        return None
    parts = head.split(",")
    measurement = parts[0].replace("\\ ", " ")
    tags: dict[str, str] = {}
    for pair in parts[1:]:
        key, _, value = pair.partition("=")
        tags[key] = value.replace("\\ ", " ").replace("\\,", ",")
    fields_text, _, timestamp = rest.partition(" ")
    fields: dict[str, Any] = {}
    for pair in fields_text.split(",") if fields_text else []:
        key, _, value = pair.partition("=")
        if value.endswith("i") and value[:-1].lstrip("-").isdigit():
            fields[key] = int(value[:-1])
        elif value.startswith('"') and value.endswith('"'):
            fields[key] = value[1:-1]
        else:
            try:
                fields[key] = float(value)
            except ValueError:
                fields[key] = value
    return {
        "measurement": measurement,
        "tags": tags,
        "fields": fields,
        "timestamp": timestamp.strip() or None,
        "at": time.time(),
    }


def handle(world, req: Request) -> Response:
    route = req.path[len(API_PREFIX) :].strip("/")

    if route in ("health", "ping"):
        return _json({"name": "influxdb", "status": "pass", "version": "2.7.0"})

    if route == "api/v2/write" and req.method == "POST":
        bucket = req.query.get("bucket", "")
        for raw in req.body.decode("utf-8", "replace").splitlines():
            point = _parse_line(raw)
            if point is not None:
                point["bucket"] = bucket
                world.influx_points.append(point)
        return Response(status=204, body=b"", headers={})

    if route == "api/v2/query" and req.method == "POST":
        # Flux is not interpreted. An annotated but empty result is a valid
        # answer and is what an empty bucket would return anyway.
        return _text(
            "#datatype,string,long\n"
            "#group,false,false\n"
            "#default,_result,\n"
            ",result,table\n"
            "\n"
        )

    if route == "api/v2/buckets":
        names = sorted({point.get("bucket", "") for point in world.influx_points})
        return _json({"buckets": [{"id": name, "name": name, "orgID": "meteringco"} for name in names if name]})

    return _json({"code": "not found", "message": f"no route for {req.method} {req.path}"}, status=404)
