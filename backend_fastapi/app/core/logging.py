"""Structured logging + secret redaction — mirrors apps/common/logging.py (Django)."""

import logging
import re
import sys

from app.core.config import get_settings

_SECRET_PATTERNS = [
    re.compile(r"(GEMINI_API_KEY\s*[:=]\s*)\S+", re.IGNORECASE),
    re.compile(r"(Bearer\s+)[A-Za-z0-9\-_.]+", re.IGNORECASE),
    re.compile(r"(password\s*[:=]\s*)\S+", re.IGNORECASE),
    re.compile(r"(api[_-]?key\s*[:=]\s*)\S+", re.IGNORECASE),
    re.compile(r"(jwt[_-]?secret\S*\s*[:=]\s*)\S+", re.IGNORECASE),
]


def redact(message: str) -> str:
    for pattern in _SECRET_PATTERNS:
        message = pattern.sub(r"\1***REDACTED***", message)
    return message


class RedactSecretsFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        if isinstance(record.msg, str):
            record.msg = redact(record.msg)
        if record.args:
            record.args = tuple(redact(str(a)) if isinstance(a, str) else a for a in record.args)
        return True


class RequestIDLogFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        if not hasattr(record, "request_id"):
            record.request_id = "-"
        return super().format(record)


def configure_logging() -> None:
    settings = get_settings()
    handler = logging.StreamHandler(sys.stdout)
    handler.addFilter(RedactSecretsFilter())
    handler.setFormatter(
        RequestIDLogFormatter(
            "%(asctime)s %(levelname)s %(name)s [request_id=%(request_id)s] %(message)s"
        )
    )
    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(settings.log_level)
