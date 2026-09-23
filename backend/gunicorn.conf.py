"""Gunicorn settings: Uvicorn workers + Prometheus multiprocess cleanup."""

from prometheus_client import multiprocess

bind = "0.0.0.0:8000"
workers = 3
worker_class = "uvicorn.workers.UvicornWorker"
# Honour X-Forwarded-* from the reverse proxy (Nginx) in front of the container.
forwarded_allow_ips = "*"


def child_exit(server, worker):  # noqa: ARG001
    multiprocess.mark_process_dead(worker.pid)
