import logging
import re

_SECRET_PATTERNS = [
    re.compile(r"(GEMINI_API_KEY\s*[:=]\s*)\S+", re.IGNORECASE),
    re.compile(r"(Bearer\s+)[A-Za-z0-9\-_.]+", re.IGNORECASE),
    re.compile(r"(password\s*[:=]\s*)\S+", re.IGNORECASE),
    re.compile(r"(api[_-]?key\s*[:=]\s*)\S+", re.IGNORECASE),
]


def redact(message: str) -> str:
    for pattern in _SECRET_PATTERNS:
        message = pattern.sub(r"\1***REDACTED***", message)
    return message


class RedactSecretsFilter(logging.Filter):
    """Strips secrets/tokens/passwords from log records — docs/09-security-and-privacy.md §10."""

    def filter(self, record: logging.LogRecord) -> bool:
        if isinstance(record.msg, str):
            record.msg = redact(record.msg)
        if record.args:
            record.args = tuple(redact(str(a)) if isinstance(a, str) else a for a in record.args)
        return True


class RequestIDLogFormatter(logging.Formatter):
    """Ensures %(request_id)s is always available even outside request scope."""

    def format(self, record: logging.LogRecord) -> str:
        if not hasattr(record, "request_id"):
            record.request_id = "-"
        return super().format(record)
