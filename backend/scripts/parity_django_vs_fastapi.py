#!/usr/bin/env python
"""
Replay one identical request sequence against the legacy Django backend and the FastAPI backend and
diff (status code, normalized JSON body) for every step. Volatile values (UUIDs, timestamps, JWTs,
request ids) are normalized to placeholders; everything else must match exactly.

Temporary: delete together with backend_django_legacy/ once rollback is no longer needed.

    python -m scripts.parity_django_vs_fastapi DJANGO_BASE FASTAPI_BASE
"""

import json
import re
import sys
import uuid

import httpx

UUID = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")
TS = re.compile(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})")
EMAIL = re.compile(r"parity2?-[0-9a-f]{8}@example\.com")
PASSWORD = "Sup3rSecret!pass"


def norm(value):
    if isinstance(value, dict) and value and all(UUID.fullmatch(k) for k in value):
        # UUID-keyed mapping (ranking breakdown): compare the values, not the random keys.
        return sorted((norm(v) for v in value.values()), key=str)
    if isinstance(value, dict):
        out = {}
        for k, v in sorted(value.items()):
            key = "<uuid>" if UUID.fullmatch(k) else k
            if k in ("access", "request_id"):
                out[key] = "<volatile>"
            else:
                out[key] = norm(v)
        return out
    if isinstance(value, list):
        return [norm(v) for v in value]
    if isinstance(value, str):
        value = EMAIL.sub("<email>", TS.sub("<ts>", UUID.sub("<uuid>", value)))
        # decimals: Django and FastAPI may render 6 vs 6.000; compare numerically
        try:
            return f"<num:{float(value):g}>" if re.fullmatch(r"-?\d+(\.\d+)?", value) else value
        except ValueError:
            return value
    if isinstance(value, float | int) and not isinstance(value, bool):
        return f"<num:{float(value):g}>"
    return value


def run(base: str) -> list[tuple[str, int, object]]:
    api = f"{base}/api/v1"
    log: list[tuple[str, int, object]] = []

    def step(label, client, method, path, *, json_body=None, headers=None):
        r = client.request(method, f"{api}{path}", json=json_body, headers=headers)
        try:
            body = r.json() if r.content else None
        except ValueError:
            body = "<non-json>"
        log.append((label, r.status_code, norm(body)))
        return r

    with httpx.Client() as c, httpx.Client() as other:
        for cl in (c, other):
            cl.get(f"{api}/auth/csrf")
        csrf = c.cookies.get("df_csrftoken") or ""
        csrf2 = other.cookies.get("df_csrftoken") or ""
        email = f"parity-{uuid.uuid4().hex[:8]}@example.com"
        email2 = f"parity2-{uuid.uuid4().hex[:8]}@example.com"

        step(
            "register bad email",
            c,
            "POST",
            "/auth/register",
            json_body={"email": "nope", "password": PASSWORD},
            headers={"X-CSRFToken": csrf},
        )
        step(
            "register short pw",
            c,
            "POST",
            "/auth/register",
            json_body={"email": email, "password": "short"},
            headers={"X-CSRFToken": csrf},
        )
        r = step(
            "register ok",
            c,
            "POST",
            "/auth/register",
            json_body={"email": email, "password": PASSWORD},
            headers={"X-CSRFToken": csrf},
        )
        access = r.json()["access"]
        step(
            "register dup",
            c,
            "POST",
            "/auth/register",
            json_body={"email": email, "password": PASSWORD},
            headers={"X-CSRFToken": csrf},
        )
        step(
            "login bad pw",
            c,
            "POST",
            "/auth/login",
            json_body={"email": email, "password": "wrong-password-1"},
            headers={"X-CSRFToken": csrf},
        )
        r = step(
            "login ok",
            c,
            "POST",
            "/auth/login",
            json_body={"email": email, "password": PASSWORD},
            headers={"X-CSRFToken": csrf},
        )
        access = r.json()["access"]
        h = {"Authorization": f"Bearer {access}"}
        r2 = other.post(
            f"{api}/auth/register",
            json={"email": email2, "password": PASSWORD},
            headers={"X-CSRFToken": csrf2},
        )
        h2 = {"Authorization": f"Bearer {r2.json()['access']}"}

        step("me", c, "GET", "/me", headers=h)
        step("me unauth", c, "GET", "/me")
        step("me bad token", c, "GET", "/me", headers={"Authorization": "Bearer garbage"})
        step(
            "patch profile",
            c,
            "PATCH",
            "/me/profile",
            json_body={"display_name": "Parity", "timezone": "Europe/Zurich"},
            headers=h,
        )
        step("patch profile bad", c, "PATCH", "/me/profile", json_body={"timezone": 5}, headers=h)
        step("refresh no csrf", c, "POST", "/auth/refresh")
        step("refresh ok", c, "POST", "/auth/refresh", headers={"X-CSRFToken": csrf})

        step("decision empty title", c, "POST", "/decisions", json_body={"title": ""}, headers=h)
        r = step(
            "decision create",
            c,
            "POST",
            "/decisions",
            json_body={"title": "Parity decision", "context": "ctx", "category": "career"},
            headers=h,
        )
        did = r.json()["id"]
        step("decision list", c, "GET", "/decisions", headers=h)
        step("decision list filter", c, "GET", "/decisions?status=DRAFT&category=career", headers=h)
        step("decision list bad page_size", c, "GET", "/decisions?page_size=1000", headers=h)
        step("decision get", c, "GET", f"/decisions/{did}", headers=h)
        step("decision get other user", other, "GET", f"/decisions/{did}", headers=h2)
        step("decision get random uuid", c, "GET", f"/decisions/{uuid.uuid4()}", headers=h)
        step("decision get bad uuid", c, "GET", "/decisions/not-a-uuid", headers=h)
        step(
            "decision patch title",
            c,
            "PATCH",
            f"/decisions/{did}",
            json_body={"title": "Renamed"},
            headers=h,
        )
        step(
            "decision patch bad status",
            c,
            "PATCH",
            f"/decisions/{did}",
            json_body={"status": "COMMITTED"},
            headers=h,
        )

        alt = {}
        for name in ("A", "B"):
            r = step(
                f"alt create {name}",
                c,
                "POST",
                f"/decisions/{did}/alternatives",
                json_body={"name": name},
                headers=h,
            )
            alt[name] = r.json()["id"]
        step(
            "alt create dup",
            c,
            "POST",
            f"/decisions/{did}/alternatives",
            json_body={"name": "A"},
            headers=h,
        )
        step(
            "alt create other user",
            other,
            "POST",
            f"/decisions/{did}/alternatives",
            json_body={"name": "X"},
            headers=h2,
        )
        step("alt list", c, "GET", f"/decisions/{did}/alternatives", headers=h)
        step(
            "alt patch",
            c,
            "PATCH",
            f"/alternatives/{alt['B']}",
            json_body={"description": "second"},
            headers=h,
        )

        crit = {}
        for name, weight, direction in (("Pay", "6", "benefit"), ("Cost", "4", "cost")):
            r = step(
                f"crit create {name}",
                c,
                "POST",
                f"/decisions/{did}/criteria",
                json_body={"name": name, "weight": weight, "direction": direction},
                headers=h,
            )
            crit[name] = r.json()["id"]
        step(
            "crit weight zero",
            c,
            "POST",
            f"/decisions/{did}/criteria",
            json_body={"name": "Z", "weight": "0", "direction": "benefit"},
            headers=h,
        )
        step(
            "crit bad direction",
            c,
            "POST",
            f"/decisions/{did}/criteria",
            json_body={"name": "Z", "weight": "1", "direction": "sideways"},
            headers=h,
        )
        step(
            "crit dup",
            c,
            "POST",
            f"/decisions/{did}/criteria",
            json_body={"name": "Pay", "weight": "1", "direction": "benefit"},
            headers=h,
        )
        step("crit list", c, "GET", f"/decisions/{did}/criteria", headers=h)
        step(
            "crit patch weight",
            c,
            "PATCH",
            f"/criteria/{crit['Pay']}",
            json_body={"weight": "7"},
            headers=h,
        )

        step("ranking missing scores", c, "GET", f"/decisions/{did}/ranking", headers=h)
        cell = lambda a, k, s: {"alternative_id": alt[a], "criterion_id": crit[k], "score": s}  # noqa: E731
        step(
            "scores partial",
            c,
            "PUT",
            f"/decisions/{did}/scores",
            json_body={"scores": [cell("A", "Pay", 9)]},
            headers=h,
        )
        step(
            "scores out of range",
            c,
            "PUT",
            f"/decisions/{did}/scores",
            json_body={"scores": [cell("A", "Pay", 99)]},
            headers=h,
        )
        step(
            "scores full",
            c,
            "PUT",
            f"/decisions/{did}/scores",
            json_body={
                "scores": [
                    cell("A", "Pay", 9),
                    cell("A", "Cost", 4),
                    cell("B", "Pay", 6),
                    cell("B", "Cost", 8),
                ]
            },
            headers=h,
        )
        step("scores get", c, "GET", f"/decisions/{did}/scores", headers=h)
        step("decision after scoring", c, "GET", f"/decisions/{did}", headers=h)
        step("ranking", c, "GET", f"/decisions/{did}/ranking", headers=h)
        step("ranking other user", other, "GET", f"/decisions/{did}/ranking", headers=h2)
        step("ranking unauth", c, "GET", f"/decisions/{did}/ranking")

        step("alt delete", c, "DELETE", f"/alternatives/{alt['B']}", headers=h)
        step("ranking one alt", c, "GET", f"/decisions/{did}/ranking", headers=h)
        step("crit delete", c, "DELETE", f"/criteria/{crit['Cost']}", headers=h)
        step(
            "decision archive",
            c,
            "PATCH",
            f"/decisions/{did}",
            json_body={"status": "ARCHIVED"},
            headers=h,
        )
        step("decision delete", c, "DELETE", f"/decisions/{did}", headers=h)
        step("decision get deleted", c, "GET", f"/decisions/{did}", headers=h)
        step("logout", c, "POST", "/auth/logout", headers={**h, "X-CSRFToken": csrf})
        step("me delete", other, "POST", "/me/delete", headers=h2)
    return log


# Deliberate, documented differences (docs/django-to-fastapi-migration-report.md). Anything that
# differs and is NOT listed here fails the run.
INTENDED = {
    "me bad token": "wording of the invalid-token message",
    "patch profile bad": "FastAPI rejects a non-string timezone; Django silently coerced 5 -> '5'",
    "refresh no csrf": "Django returned an HTML 403 page; FastAPI returns the JSON error envelope",
    "decision get other user": "not_found wording (Django leaked the model name)",
    "decision get random uuid": "not_found wording",
    "decision get bad uuid": "Django returned an HTML 404 page; FastAPI returns the JSON envelope",
    "alt create other user": "not_found wording",
    "scores out of range": "Django echoed a stringified serializer dict; FastAPI reports the field",
    "ranking other user": "not_found wording",
    "decision get deleted": "not_found wording",
}


# The only intended difference that changes a status code (200 -> 400): stricter input validation.
STATUS_CHANGE_ALLOWED = {"patch profile bad"}


def main() -> int:
    django_base, fastapi_base = sys.argv[1], sys.argv[2]
    a, b = run(django_base), run(fastapi_base)
    unexpected = intended = 0
    for (label, sa, ba), (_l, sb, bb) in zip(a, b, strict=True):
        if sa == sb and ba == bb:
            continue
        if label in INTENDED and (sa == sb or label in STATUS_CHANGE_ALLOWED):
            intended += 1
            print(f"intended  {label}: {INTENDED[label]}")
            continue
        unexpected += 1
        print(
            f"UNEXPECTED DIFF  {label}"
            f" | django: {sa} {json.dumps(ba, sort_keys=True)[:300]}"
            f" | fastapi: {sb} {json.dumps(bb, sort_keys=True)[:300]}"
        )
    identical = len(a) - intended - unexpected
    print(
        f"{identical}/{len(a)} steps identical (status + normalized body); "
        f"{intended} documented intentional differences; {unexpected} unexpected"
    )
    return 1 if unexpected else 0


if __name__ == "__main__":
    sys.exit(main())
