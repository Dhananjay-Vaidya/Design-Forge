"""
Application exception hierarchy + the standard error envelope, replacing
apps/common/exceptions.py (Django). Envelope shape is unchanged (docs/05-api-specification.md §6):

    {"error": {"code", "message", "fields"?, "retry_after_seconds"?, "request_id"}}
"""

from __future__ import annotations

import logging

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
    """ERR-QUOTA — reserved for the Phase 3 AI layer; not used yet (no AI endpoints exist)."""

    code = "quota_exhausted"
    status_code = status.HTTP_429_TOO_MANY_REQUESTS


class ProviderUnavailableError(AppError):
    """Reserved for the Phase 3 AI layer."""

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


def _fields_from_pydantic_errors(errors: list[dict]) -> dict[str, list[str]]:
    fields: dict[str, list[str]] = {}
    for err in errors:
        loc = [str(p) for p in err["loc"] if p not in ("body", "query", "path")]
        field_name = ".".join(loc) or "__root__"
        fields.setdefault(field_name, []).append(err["msg"])
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
        fields = _fields_from_pydantic_errors(exc.errors())
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content=_envelope(
                "validation_error", "One or more fields are invalid.", request, fields=fields
            ),
        )

    @app.exception_handler(StarletteHTTPException)
    async def http_exception_handler(
        request: Request, exc: StarletteHTTPException
    ) -> JSONResponse:
        code = _CODE_BY_STATUS.get(exc.status_code, "server_error")
        message = exc.detail if isinstance(exc.detail, str) else "Request failed."
        return JSONResponse(
            status_code=exc.status_code, content=_envelope(code, message, request)
        )

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
        request_id = getattr(request.state, "request_id", None)
        logger.exception("Unhandled server error", extra={"request_id": request_id or "-"})
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=_envelope("server_error", "An unexpected error occurred.", request),
        )
