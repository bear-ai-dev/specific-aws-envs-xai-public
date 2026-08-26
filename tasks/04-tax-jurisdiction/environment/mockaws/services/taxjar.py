"""Tax authority emulator speaking the TaxJar v2 REST API.

Two base URLs are served, `/taxjar/sandbox` and `/taxjar/production`, matching
the two the platform is configured with. They are separate worlds: an account
key is accepted by both, but each carries its own rate table, so an invoice
priced against the wrong one comes back with a plausible number that is simply
not the right one. Nothing here refuses a request for being routed oddly — a
mistake shows up as the wrong amount of tax, not as an exception.

Everything a caller sends is recorded. The verifier reads the log over the
admin channel, so it grades what the platform actually asked the authority
rather than anything the platform reports about itself.
"""

from __future__ import annotations

import json
import time
from typing import Any

from ..wire import Request, Response

API_PREFIX = "/taxjar/"


def _json(payload: Any, status: int = 200) -> Response:
    return Response(
        status=status,
        body=json.dumps(payload, separators=(",", ":")).encode(),
        headers={"Content-Type": "application/json"},
    )


def _error(error: str, detail: str, status: int) -> Response:
    # The shape taxjar-node needs in order to raise a TaxjarError rather than
    # an opaque transport failure: `error`, `detail` and `status` must all be
    # present or the client throws the raw result object instead.
    return _json({"error": error, "detail": detail, "status": status}, status=status)


def route(path: str) -> tuple[str, str] | None:
    """Split `/taxjar/<environment>/v2/<resource>` into (environment, resource)."""
    if not path.startswith(API_PREFIX):
        return None
    rest = path[len(API_PREFIX) :]
    parts = rest.split("/", 2)
    if len(parts) < 3 or parts[1] != "v2":
        return None
    return parts[0], parts[2].strip("/")


def _bearer(req: Request) -> str:
    value = req.header("authorization")
    if value.lower().startswith("bearer "):
        return value[7:].strip()
    return value.strip()


def _money(value: Any) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def _line_total(line: dict[str, Any]) -> float:
    return _money(line.get("quantity")) * _money(line.get("unit_price")) - _money(line.get("discount"))


def handle(world, req: Request) -> Response:
    parsed = route(req.path)
    if parsed is None:
        return _error("Not Found", f"No route matches {req.path}", 404)
    environment, resource = parsed

    authority = world.tax
    if environment not in authority.environments:
        return _error("Not Found", f"Unknown environment {environment}", 404)

    key = _bearer(req)
    account = authority.api_keys.get(key)
    if account is None:
        return _error("Unauthorized", "Not authorized for route", 401)

    body: dict[str, Any] = {}
    if req.body:
        try:
            body = req.json()
        except ValueError:
            return _error("Bad Request", "Request body is not valid JSON", 400)

    authority.calls.append(
        {
            "at": time.time(),
            "environment": environment,
            "resource": resource,
            "method": req.method,
            "api_key": key,
            "account": account,
            "body": body,
        }
    )

    if resource == "taxes" and req.method == "POST":
        return _tax_for_order(authority, environment, account, body)
    if resource == "transactions/orders" and req.method == "POST":
        return _create_order(authority, environment, account, body)
    if resource == "transactions/orders" and req.method == "GET":
        ids = [
            order["transaction_id"]
            for order in authority.orders
            if order["account"] == account and order["environment"] == environment
        ]
        return _json({"orders": ids})
    if resource.startswith("transactions/orders/") and req.method == "GET":
        wanted = resource.split("/", 2)[2]
        for order in authority.orders:
            if order["transaction_id"] == wanted and order["account"] == account:
                return _json({"order": order["payload"]})
        return _error("Not Found", "Resource can not be found", 404)
    if resource == "categories" and req.method == "GET":
        return _json(
            {
                "categories": [
                    {"name": name, "product_tax_code": code, "description": name}
                    for code, name in sorted(authority.category_names.items())
                ]
            }
        )
    return _error("Not Found", f"No route matches /v2/{resource}", 404)


def _validate_address(authority, body: dict[str, Any]) -> str | None:
    to_country = str(body.get("to_country") or "").strip()
    if not to_country:
        return "to_country is required"
    if not str(body.get("from_country") or "").strip():
        return "from_country is required"
    to_zip = str(body.get("to_zip") or "").strip()
    to_state = str(body.get("to_state") or "").strip().lower()
    if to_country.lower() == "us":
        if not to_zip:
            return "to_zip is required when to_country is US"
        if not to_state:
            return "to_state is required when to_country is US"
        owner = authority.zip_state.get(to_zip)
        if owner is not None and owner != to_state:
            return "to_zip is not a valid postal code for to_state"
    return None


def _rate_for(authority, environment: str, country: str, state: str, postal: str) -> dict[str, Any]:
    table = authority.environments[environment]
    country = (country or "").strip().lower()
    state = (state or "").strip().lower()
    postal = (postal or "").strip().upper()
    for candidate in (f"{country}/{state}/{postal}", f"{country}/{state}", country):
        if candidate in table:
            return table[candidate]
    return {"rate": 0.0, "name": "", "has_nexus": False}


def _tax_for_order(authority, environment: str, account: str, body: dict[str, Any]) -> Response:
    problem = _validate_address(authority, body)
    if problem is not None:
        return _error("Bad Request", problem, 400)

    jurisdiction = _rate_for(
        authority,
        environment,
        str(body.get("to_country") or ""),
        str(body.get("to_state") or ""),
        str(body.get("to_zip") or ""),
    )

    lines = body.get("line_items") or []
    taxable = 0.0
    for line in lines:
        code = str(line.get("product_tax_code") or "").strip()
        multiplier = authority.product_tax_codes.get(code, 1.0) if code else 1.0
        taxable += _line_total(line) * multiplier
    subtotal = sum(_line_total(line) for line in lines)
    shipping = _money(body.get("shipping"))

    # A category that is only partly taxable lowers the effective rate the
    # caller is quoted, which is how the platform's stored rate ends up
    # reflecting what the business actually sells.
    base_rate = float(jurisdiction.get("rate", 0.0))
    effective = base_rate * (taxable / subtotal) if subtotal else base_rate
    amount_to_collect = round(effective * subtotal, 2)

    return _json(
        {
            "tax": {
                "order_total_amount": round(subtotal + shipping, 2),
                "shipping": shipping,
                "taxable_amount": round(taxable, 2),
                "amount_to_collect": amount_to_collect,
                "rate": effective,
                "has_nexus": bool(jurisdiction.get("has_nexus", True)),
                "freight_taxable": False,
                "tax_source": "destination",
                "jurisdictions": {
                    "country": str(body.get("to_country") or "").upper(),
                    "state": str(body.get("to_state") or "").upper(),
                    "city": str(body.get("to_city") or "").upper(),
                },
            }
        }
    )


def _create_order(authority, environment: str, account: str, body: dict[str, Any]) -> Response:
    transaction_id = str(body.get("transaction_id") or "").strip()
    if not transaction_id:
        return _error("Bad Request", "transaction_id is required", 400)
    for existing in authority.orders:
        if existing["transaction_id"] == transaction_id and existing["account"] == account:
            return _error("Unprocessable Entity", "transaction_id has already been taken", 422)

    payload = {
        "transaction_id": transaction_id,
        "user_id": account,
        "transaction_date": body.get("transaction_date"),
        "provider": body.get("provider") or "api",
        "to_country": body.get("to_country"),
        "to_zip": body.get("to_zip"),
        "to_state": body.get("to_state"),
        "to_city": body.get("to_city"),
        "to_street": body.get("to_street"),
        "amount": _money(body.get("amount")),
        "shipping": _money(body.get("shipping")),
        "sales_tax": _money(body.get("sales_tax")),
        "line_items": body.get("line_items") or [],
    }
    authority.orders.append(
        {
            "transaction_id": transaction_id,
            "account": account,
            "environment": environment,
            "payload": payload,
        }
    )
    return _json({"order": payload}, status=201)
