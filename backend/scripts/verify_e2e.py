#!/usr/bin/env python
"""
Live end-to-end verification against a RUNNING backend (no test DB, no mocks):
register -> login -> refresh -> create the demo decision -> alternatives/criteria/scores ->
deterministic ranking -> cross-user isolation -> logout. Creates throwaway users only.

    python -m scripts.verify_e2e [BASE_URL]       (default http://localhost:8000)
"""

import sys
import uuid
from decimal import Decimal

import httpx

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8000").rstrip("/")
API = f"{BASE}/api/v1"
PASSWORD = "Sup3rSecret!pass"


def check(label: str, condition: bool, detail: object = "") -> None:
    print(f"[{'PASS' if condition else 'FAIL'}] {label}" + (f"  {detail}" if not condition else ""))
    if not condition:
        sys.exit(1)


def register(client: httpx.Client) -> tuple[str, dict]:
    client.get(f"{API}/auth/csrf")
    csrf = client.cookies.get("df_csrftoken") or ""
    email = f"verify-{uuid.uuid4().hex[:8]}@example.com"
    r = client.post(
        f"{API}/auth/register",
        json={"email": email, "password": PASSWORD},
        headers={"X-CSRFToken": csrf},
    )
    check("register -> 201", r.status_code == 201, r.text)
    body = r.json()
    check("register response has {user, access}", {"user", "access"} <= set(body), body.keys())
    check(
        "user shape matches frontend type",
        {"id", "email", "created_at", "profile"} <= set(body["user"])
        and {"display_name", "timezone", "quota_tier", "preferences"}
        <= set(body["user"]["profile"]),
    )
    return email, {"Authorization": f"Bearer {body['access']}", "X-CSRFToken": csrf}


def main() -> None:
    check("GET /health", httpx.get(f"{BASE}/health").json() == {"status": "ok"})
    ready = httpx.get(f"{BASE}/ready")
    check("GET /ready 200 (db + redis)", ready.status_code == 200, ready.text)
    check("OpenAPI served", httpx.get(f"{BASE}/api/openapi.json").status_code == 200)
    check("Swagger UI served", httpx.get(f"{BASE}/docs").status_code == 200)
    check("ReDoc served", httpx.get(f"{BASE}/redoc").status_code == 200)
    check(
        "/metrics served", "decisionforge_http_requests_total" in httpx.get(f"{BASE}/metrics").text
    )

    with httpx.Client() as owner, httpx.Client() as other:
        email, h = register(owner)
        r = owner.post(f"{API}/auth/login", json={"email": email, "password": PASSWORD}, headers=h)
        check("login -> 200", r.status_code == 200, r.text)
        h["Authorization"] = f"Bearer {r.json()['access']}"
        check("GET /me", owner.get(f"{API}/me", headers=h).json()["email"] == email)
        r = owner.post(f"{API}/auth/refresh", headers=h)
        check(
            "refresh via cookie + CSRF -> new access", r.status_code == 200 and "access" in r.json()
        )

        r = owner.post(
            f"{API}/decisions",
            json={"title": "Choose the best master's program for 2027", "category": "education"},
            headers=h,
        )
        check("create decision -> 201", r.status_code == 201, r.text)
        did = r.json()["id"]
        alts = {}
        for name in ("MIT", "CMU"):
            r = owner.post(f"{API}/decisions/{did}/alternatives", json={"name": name}, headers=h)
            check(f"add alternative {name}", r.status_code == 201, r.text)
            alts[name] = r.json()["id"]
        crits = {}
        for name, weight, direction in (("Reputation", "6", "benefit"), ("Cost", "4", "cost")):
            r = owner.post(
                f"{API}/decisions/{did}/criteria",
                json={"name": name, "weight": weight, "direction": direction},
                headers=h,
            )
            check(f"add criterion {name}", r.status_code == 201, r.text)
            crits[name] = r.json()["id"]
        cells = [
            (alts["MIT"], crits["Reputation"], 10),
            (alts["MIT"], crits["Cost"], 8),
            (alts["CMU"], crits["Reputation"], 8),
            (alts["CMU"], crits["Cost"], 3),
        ]
        r = owner.put(
            f"{API}/decisions/{did}/scores",
            json={
                "scores": [
                    {"alternative_id": a, "criterion_id": c, "score": s} for a, c, s in cells
                ]
            },
            headers=h,
        )
        check("upsert scores -> 200", r.status_code == 200, r.text)
        r = owner.get(f"{API}/decisions/{did}/ranking", headers=h)
        check("ranking -> 200", r.status_code == 200, r.text)
        ranking = r.json()
        # Hand-calculated: weights 6/4 -> 0.6/0.4; benefit (s-1)/9, cost (10-s)/9.
        #   MIT = .6*1 + .4*(2/9) = 0.68889     CMU = .6*(7/9) + .4*(7/9) = 0.77778  -> CMU wins
        totals = {row["name"]: Decimal(str(row["total"])) for row in ranking["ranking"]}
        check("MIT total = 0.6889", abs(totals["MIT"] - Decimal("0.68889")) < Decimal("0.0001"))
        check("CMU total = 0.7778", abs(totals["CMU"] - Decimal("0.77778")) < Decimal("0.0001"))
        check("CMU ranked first", ranking["ranking"][0]["name"] == "CMU")

        register_other = register(other)
        other_h = register_other[1]
        r = other.get(f"{API}/decisions/{did}", headers=other_h)
        check("cross-user GET decision -> 404", r.status_code == 404, r.status_code)
        r = other.get(f"{API}/decisions/{did}/ranking", headers=other_h)
        check("cross-user ranking -> 404", r.status_code == 404, r.status_code)
        check(
            "cross-user list is empty",
            other.get(f"{API}/decisions", headers=other_h).json().get("count", 0) == 0,
        )
        check("unauthenticated list -> 401", httpx.get(f"{API}/decisions").status_code == 401)

        r = owner.post(f"{API}/auth/logout", headers=h)
        check("logout -> 204", r.status_code == 204, r.status_code)
        r = owner.post(f"{API}/auth/refresh", headers=h)
        check("refresh after logout rejected", r.status_code in (401, 403), r.status_code)

    print("\nAll live end-to-end checks passed.")


if __name__ == "__main__":
    main()
