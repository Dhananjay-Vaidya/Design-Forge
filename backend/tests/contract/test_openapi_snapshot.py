"""OpenAPI drift check. Regenerate intentionally with: make openapi"""

import json
from pathlib import Path

from app.main import app

SNAPSHOT = Path(__file__).resolve().parents[3] / "docs" / "openapi.json"


def test_openapi_matches_committed_snapshot():
    current = json.loads(json.dumps(app.openapi(), sort_keys=True))
    committed = json.loads(SNAPSHOT.read_text(encoding="utf-8"))
    assert current == committed, "API contract changed; review the diff, then run `make openapi`."


def test_openapi_declares_bearer_auth_and_error_paths():
    schema = app.openapi()
    assert "/api/v1/decisions" in schema["paths"]
    assert "/api/v1/auth/login" in schema["paths"]
    assert schema["info"]["title"] == "DecisionForge AI"
