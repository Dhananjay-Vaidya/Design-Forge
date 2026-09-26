#!/usr/bin/env python
"""
Execute every Grafana panel query against a live Prometheus and report the ones that are INVALID
(parse errors, unknown functions, bad regex). A query that is valid but returns no series (e.g. AI
metrics before any AI traffic exists) is reported separately as "no data" and is not a failure.

    python -m scripts.check_dashboards [PROMETHEUS_URL] [DASHBOARD_DIR]
    (defaults: http://prometheus:9090  /infrastructure/grafana/dashboards)
"""

import json
import sys
from pathlib import Path

import httpx


def main() -> int:
    prom = (sys.argv[1] if len(sys.argv) > 1 else "http://prometheus:9090").rstrip("/")
    root = Path(sys.argv[2] if len(sys.argv) > 2 else "/infrastructure/grafana/dashboards")
    invalid = empty = ok = 0
    paths = sorted(root.glob("*.json"))
    if not paths:
        print(f"No dashboards found in {root}")
        return 1
    for path in paths:
        dashboard = json.loads(path.read_text(encoding="utf-8"))
        print(f"== {dashboard['title']} ({path.name})")
        for panel in dashboard["panels"]:
            for target in panel.get("targets", []):
                expr = target["expr"].replace("$__rate_interval", "5m").replace("$__interval", "5m")
                r = httpx.get(f"{prom}/api/v1/query", params={"query": expr}, timeout=15)
                body = r.json()
                if body.get("status") != "success":
                    invalid += 1
                    print(f"  INVALID  [{panel['title']}] {expr}\n           {body.get('error')}")
                elif not body["data"]["result"]:
                    empty += 1
                    print(f"  no data  [{panel['title']}]")
                else:
                    ok += 1
    print(f"\n{ok} queries returned data, {empty} valid but empty, {invalid} INVALID")
    return 1 if invalid else 0


if __name__ == "__main__":
    sys.exit(main())
