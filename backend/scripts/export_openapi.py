#!/usr/bin/env python
"""
Write the OpenAPI schema to a file (default docs/openapi.json at the repo root) with stable
formatting so it can be diffed in review and checked by tests/contract/test_openapi_snapshot.py.

    python -m scripts.export_openapi [PATH]
"""

import json
import sys
from pathlib import Path

from app.main import app

DEFAULT_PATH = Path(__file__).resolve().parents[2] / "docs" / "openapi.json"


def main() -> int:
    target = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_PATH
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(app.openapi(), indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(f"Wrote {target}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
