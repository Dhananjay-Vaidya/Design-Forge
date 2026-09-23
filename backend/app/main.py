"""
FastAPI application entrypoint — replaces backend/config/{urls.py,wsgi.py,asgi.py} (Django).
Endpoint paths and the error envelope are unchanged from the Django backend so the frontend works
unmodified. HTTP metric names changed (django_http_* -> decisionforge_http_*); the mapping is in
docs/django-to-fastapi-migration-report.md and the dashboards/rules were updated to match.
"""

import os

from fastapi import FastAPI, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from prometheus_client import CONTENT_TYPE_LATEST, CollectorRegistry, generate_latest, multiprocess

from app.api.v1.router import api_router
from app.core.config import get_settings
from app.core.exceptions import register_exception_handlers
from app.core.logging import configure_logging
from app.core.middleware import AccessLogMiddleware, RequestIDMiddleware, SecurityHeadersMiddleware
from app.observability import health
from app.observability.http_metrics import HTTPMetricsMiddleware

settings = get_settings()

configure_logging()

app = FastAPI(
    title=settings.app_name,
    description="Deterministic decision scoring with optional Gemini advisory analysis.",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/api/openapi.json",
)

app.add_middleware(AccessLogMiddleware)
app.add_middleware(RequestIDMiddleware)
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_middleware(TrustedHostMiddleware, allowed_hosts=settings.allowed_hosts)

register_exception_handlers(app)

app.include_router(health.router)
app.include_router(api_router, prefix=settings.api_v1_prefix)

if settings.prometheus_metrics_enabled:
    app.add_middleware(HTTPMetricsMiddleware)

    @app.get("/metrics", include_in_schema=False)
    async def metrics() -> Response:
        if os.environ.get("PROMETHEUS_MULTIPROC_DIR"):
            registry = CollectorRegistry()
            multiprocess.MultiProcessCollector(registry)
            return Response(generate_latest(registry), media_type=CONTENT_TYPE_LATEST)
        return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)
