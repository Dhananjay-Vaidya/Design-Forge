"""
Celery application — structural port of backend/config/celery.py. No tasks exist to migrate yet
(docs/fastapi-migration-audit.md §10: zero registered tasks in the Django backend either); this
exists so the `worker`/`beat` Compose services have something to point at once Phase 3 (Gemini)
lands real analysis tasks.

Celery tasks run in a separate OS process from the FastAPI event loop, so they cannot reuse a
request-scoped AsyncSession. The simplest reliable approach (Step 12 decision, recorded here
rather than in a separate ADR since there's no task-specific behavior yet to justify one): each
task creates its own synchronous SQLAlchemy session via `app.core.database.sync_session_factory`
scoped to that task's run, rather than driving an asyncio event loop inside a Celery worker
process. This avoids the well-known pitfalls of mixing asyncpg connections across fork/prefork
worker boundaries. Revisit if/when a task genuinely needs to await async I/O (e.g. calling the
Gemini SDK) — at that point the task body can run `asyncio.run(...)` internally for just that
call, still using a fresh session per task invocation.
"""

from celery import Celery

from app.core.config import get_settings

settings = get_settings()

celery_app = Celery(
    "decisionforge",
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend,
)
celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    broker_connection_retry_on_startup=True,
)
celery_app.autodiscover_tasks(["app.tasks"])

from app.observability.instrumentation import install_celery_metrics  # noqa: E402

install_celery_metrics(celery_app)
