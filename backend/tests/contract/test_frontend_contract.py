"""
Every backend call the React frontend makes must exist in the FastAPI schema with that method,
and the auth response shapes must carry the fields the TypeScript types declare.
"""

import re
from pathlib import Path

import pytest
from httpx import AsyncClient

from app.main import app

FRONTEND_SRC = Path(__file__).resolve().parents[3] / "frontend" / "src"
CALL = re.compile(
    r"apiClient\s*\.\s*(get|post|put|patch|delete)\s*(?:<[^>(]*>)?\s*\(\s*[\"'`]([^\"'`]+)"
)


def _frontend_calls() -> set[tuple[str, str]]:
    calls = set()
    for path in FRONTEND_SRC.rglob("*.ts*"):
        for method, url in CALL.findall(path.read_text(encoding="utf-8")):
            calls.add((method.upper(), re.sub(r"\$\{[^}]+\}", "{param}", url.split("?")[0])))
    return calls


def _normalize(path: str) -> str:
    return re.sub(r"\{[^}]+\}", "{param}", path)


def test_frontend_calls_are_discovered():
    assert _frontend_calls(), "regex found no apiClient calls; contract test would be vacuous"


@pytest.mark.parametrize("method,url", sorted(_frontend_calls()))
def test_every_frontend_call_exists_in_openapi(method: str, url: str):
    paths = {
        _normalize(p.removeprefix("/api/v1")): set(ops) for p, ops in app.openapi()["paths"].items()
    }
    assert url in paths, f"frontend calls {method} {url}, absent from backend"
    assert method.lower() in paths[url], f"{url} exists but not for {method}"


async def test_auth_response_shape_matches_typescript_types(client: AsyncClient):
    await client.get("/api/v1/auth/csrf")
    r = await client.post(
        "/api/v1/auth/register",
        json={"email": "contract@example.com", "password": "Sup3rSecret!pass"},
        headers={"X-CSRFToken": client.cookies.get("df_csrftoken")},
    )
    assert r.status_code == 201
    body = r.json()
    assert set(body) == {"user", "access"}  # AuthResponse
    assert {"id", "email", "created_at", "profile"} <= set(body["user"])  # User
    assert set(body["user"]["profile"]) == {  # UserProfile
        "display_name",
        "timezone",
        "quota_tier",
        "preferences",
    }


async def test_error_envelope_shape_matches_typescript_type(client: AsyncClient):
    r = await client.get("/api/v1/me")
    err = r.json()["error"]
    assert {"code", "message", "request_id"} <= set(err)
