import os

from celery import Celery

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")

app = Celery("decisionforge")
app.config_from_object("django.conf:settings", namespace="CELERY")
app.autodiscover_tasks()

# Registers Celery signal handlers for Prometheus task metrics.
import apps.observability.celery  # noqa: E402,F401
