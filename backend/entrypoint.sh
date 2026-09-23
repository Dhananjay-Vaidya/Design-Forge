#!/bin/sh
set -e
# Prometheus multiprocess mode: gunicorn runs several worker processes, each with its own
# registry; /metrics aggregates the per-process files in this directory. Wiped on every start so
# stale files from a previous container run never leak into fresh counters.
export PROMETHEUS_MULTIPROC_DIR="${PROMETHEUS_MULTIPROC_DIR:-/tmp/prometheus_multiproc}"
rm -rf "$PROMETHEUS_MULTIPROC_DIR" && mkdir -p "$PROMETHEUS_MULTIPROC_DIR"

# RUN_MIGRATIONS=1 is set only on the web service so worker never races it.
if [ "${RUN_MIGRATIONS:-0}" = "1" ]; then
  python -m scripts.db_migrate
fi
exec "$@"
