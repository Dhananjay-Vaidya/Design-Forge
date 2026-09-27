"""
Application exception hierarchy + the standard error envelope, replacing
apps/common/exceptions.py (Django). Envelope shape is unchanged (docs/05-api-specification.md §6):

    {"error": {"code", "message", "fields"?, "retry_after_seconds"?, "request_id"}}
"""

from __future__ import annotations

import logging
from collections.abc import Mapping, Sequence
from typing import Any

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger("app.errors")


class AppError(Exception):
    code = "server_error"
    status_code = status.HTTP_500_INTERNAL_SERVER_ERROR

    def __init__(
        self,
        message: str,
        *,
        fields: dict[str, list[str]] | None = None,
        retry_after_seconds: int | None = None,
    ):
        self.message = message
        self.fields = fields
        self.retry_after_seconds = retry_after_seconds
        super().__init__(message)


class ValidationAppError(AppError):
    code = "validation_error"
    status_code = status.HTTP_400_BAD_REQUEST


class AuthenticationError(AppError):
    code = "authentication_required"
    status_code = status.HTTP_401_UNAUTHORIZED


class AuthorizationError(AppError):
    code = "permission_denied"
    status_code = status.HTTP_403_FORBIDDEN


class NotFoundError(AppError):
    code = "not_found"
    status_code = status.HTTP_404_NOT_FOUND


class ConflictError(AppError):
    code = "conflict"
    status_code = status.HTTP_409_CONFLICT


class RateLimitedError(AppError):
    code = "rate_limited"
    status_code = status.HTTP_429_TOO_MANY_REQUESTS


class QuotaExceededError(AppError):
    """ERR-QUOTA — a user's daily AI allowance is used up (app/ai/guard.py)."""

    code = "quota_exhausted"
    status_code = status.HTTP_429_TOO_MANY_REQUESTS


class ProviderUnavailableError(AppError):
    """The AI provider is disabled, paused by the circuit breaker, or failing."""

    code = "provider_unavailable"
    status_code = status.HTTP_503_SERVICE_UNAVAILABLE


class DatabaseError(AppError):
    code = "server_error"
    status_code = status.HTTP_500_INTERNAL_SERVER_ERROR


_CODE_BY_STATUS = {
    400: "validation_error",
    401: "authentication_required",
    403: "permission_denied",
    404: "not_found",
    409: "conflict",
    429: "rate_limited",
    500: "server_error",
}


def _envelope(
    code: str,
    message: str,
    request: Request,
    *,
    fields: dict[str, list[str]] | None = None,
    retry_after_seconds: int | None = None,
) -> dict:
    body: dict = {
        "code": code,
        "message": message,
        "request_id": getattr(request.state, "request_id", None),
    }
    if fields:
        body["fields"] = fields
    if retry_after_seconds is not None:
        body["retry_after_seconds"] = retry_after_seconds
    return {"error": body}


def _drf_message(err: Mapping[str, Any]) -> str:
    """
    Phrase common Pydantic errors the way the old DRF serializers did, so the messages the
    frontend already renders under form fields do not change with the backend swap.
    """
    kind, ctx = err.get("type", ""), err.get("ctx") or {}
    field = str(err["loc"][-1]) if err["loc"] else ""
    if kind == "missing":
        return "This field is required."
    if kind == "string_too_short":
        min_length = ctx.get("min_length", 1)
        if min_length == 1:
            return "This field may not be blank."
        return f"Ensure this field has at least {min_length} characters."
    if kind == "string_too_long":
        return f"Ensure this field has no more than {ctx.get('max_length')} characters."
    if kind == "less_than_equal":
        return f"Ensure this value is less than or equal to {ctx.get('le')}."
    if kind == "greater_than_equal":
        return f"Ensure this value is greater than or equal to {ctx.get('ge')}."
    if kind == "greater_than":
        if field == "weight":
            return "Weight must be a positive number."
        return f"Ensure this value is greater than {ctx.get('gt')}."
    if kind == "literal_error":
        return f'"{err.get("input")}" is not a valid choice.'
    if kind in ("string_type", "int_type", "bool_type"):
        return "Not a valid value."
    if kind == "uuid_parsing":
        return "Must be a valid UUID."
    if kind == "value_error":
        msg = str(err["msg"]).removeprefix("Value error, ")
        return "Enter a valid email address." if "email address" in msg else msg
    return str(err["msg"])


def _fields_from_pydantic_errors(errors: Sequence[Mapping[str, Any]]) -> dict[str, list[str]]:
    fields: dict[str, list[str]] = {}
    for err in errors:
        loc = [str(p) for p in err["loc"] if p not in ("body", "query", "path")]
        field_name = ".".join(loc) or "__root__"
        fields.setdefault(field_name, []).append(_drf_message(err))
    return fields


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content=_envelope(
                exc.code,
                exc.message,
                request,
                fields=exc.fields,
                retry_after_seconds=exc.retry_after_seconds,
            ),
        )

    @app.exception_handler(RequestValidationError)
    async def validation_error_handler(
        request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        errors = exc.errors()
        if errors and all(e["loc"] and e["loc"][0] == "path" for e in errors):
            # Malformed identifier in the URL (e.g. /decisions/not-a-uuid): the same 404 the old
            # URL converter produced, but with the JSON envelope instead of an HTML page.
            return JSONResponse(
                status_code=status.HTTP_404_NOT_FOUND,
                content=_envelope("not_found", "Not found.", request),
            )
        fields = _fields_from_pydantic_errors(errors)
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content=_envelope(
                "validation_error", "One or more fields are invalid.", request, fields=fields
            ),
        )

    @app.exception_handler(StarletteHTTPException)
    async def http_exception_handler(request: Request, exc: StarletteHTTPException) -> JSONResponse:
        code = _CODE_BY_STATUS.get(exc.status_code, "server_error")
        message = exc.detail if isinstance(exc.detail, str) else "Request failed."
        return JSONResponse(status_code=exc.status_code, content=_envelope(code, message, request))

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
        request_id = getattr(request.state, "request_id", None)
        logger.exception("Unhandled server error", extra={"request_id": request_id or "-"})
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=_envelope("server_error", "An unexpected error occurred.", request),
        )
