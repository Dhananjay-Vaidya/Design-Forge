"""
Standard API error envelope — docs/05-api-specification.md §5/§6.

Every non-2xx response is shaped as:
    {"error": {"code", "message", "fields"?, "retry_after_seconds"?, "request_id"}}
"""

import logging

from rest_framework import status
from rest_framework.exceptions import APIException
from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_exception_handler

logger = logging.getLogger("apps.common")


class ConflictError(APIException):
    status_code = status.HTTP_409_CONFLICT
    default_detail = "The request conflicts with the current state of the resource."
    default_code = "conflict"


class QuotaExceededError(APIException):
    """ERR-QUOTA — docs/02-software-requirements-specification.md §8, AC-008."""

    status_code = status.HTTP_429_TOO_MANY_REQUESTS
    default_detail = "You've reached today's AI analysis limit. Scoring and ranking still work."
    default_code = "quota_exhausted"

    def __init__(self, detail=None, retry_after_seconds: int | None = None):
        super().__init__(detail)
        self.retry_after_seconds = retry_after_seconds


_CODE_BY_STATUS = {
    400: "validation_error",
    401: "authentication_required",
    403: "permission_denied",
    404: "not_found",
    409: "conflict",
    429: "rate_limited",
    500: "server_error",
}


def _extract_fields(detail):
    """DRF ValidationError.detail is a dict of field -> [messages] for serializer errors."""
    if isinstance(detail, dict):
        return {
            key: [str(v) for v in (value if isinstance(value, list) else [value])]
            for key, value in detail.items()
            if key != "non_field_errors" or True
        }
    return None


def envelope_exception_handler(exc, context):
    response = drf_exception_handler(exc, context)
    request = context.get("request")
    request_id = getattr(request, "request_id", None) if request else None

    if response is None:
        # Unhandled exception -> generic 500, no internals leaked to the client (SEC-05/08).
        logger.exception("Unhandled server error", extra={"request_id": request_id or "-"})
        return Response(
            {
                "error": {
                    "code": "server_error",
                    "message": "An unexpected error occurred.",
                    "request_id": request_id,
                }
            },
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    code = getattr(exc, "default_code", None) or _CODE_BY_STATUS.get(
        response.status_code, "server_error"
    )
    if response.status_code in _CODE_BY_STATUS:
        code = _CODE_BY_STATUS[response.status_code]
    if isinstance(exc, QuotaExceededError):
        code = "quota_exhausted"
    if isinstance(exc, ConflictError):
        code = "conflict"

    fields = _extract_fields(response.data) if response.status_code == 400 else None
    if fields is not None:
        message = "One or more fields are invalid."
    elif isinstance(response.data, dict) and "detail" in response.data:
        message = str(response.data["detail"])
    else:
        message = str(response.data)

    error_body = {"code": code, "message": message, "request_id": request_id}
    if fields:
        error_body["fields"] = fields
    retry_after = getattr(exc, "retry_after_seconds", None)
    if retry_after is None and hasattr(exc, "wait") and exc.wait is not None:
        retry_after = int(exc.wait)
    if retry_after is not None:
        error_body["retry_after_seconds"] = retry_after

    response.data = {"error": error_body}
    return response
