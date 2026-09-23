"""
UC-01 Register, UC-02 Authenticate — FR-001/002. Mirrors apps/accounts/views.py (Django) exactly:
same paths, same status codes, same cookie/header names (docs/adr/ADR-fastapi-authentication.md).
"""

from fastapi import APIRouter, Request, Response, status

from app.api.dependencies import CurrentUser, DbSession, require_csrf
from app.core.config import get_settings
from app.core.exceptions import AuthenticationError
from app.core.security import generate_csrf_token
from app.schemas.user import AuthResponse, LoginRequest, RefreshResponse, RegisterRequest, UserRead
from app.services import auth_service

router = APIRouter(tags=["auth"])
settings = get_settings()


def _set_refresh_cookie(response: Response, refresh_token: str) -> None:
    response.set_cookie(
        key=settings.jwt_refresh_cookie_name,
        value=refresh_token,
        httponly=True,
        secure=settings.jwt_refresh_cookie_secure,
        samesite="lax",
        path=settings.jwt_refresh_cookie_path,
        max_age=settings.jwt_refresh_token_lifetime_days * 24 * 60 * 60,
    )


def _clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(settings.jwt_refresh_cookie_name, path=settings.jwt_refresh_cookie_path)


@router.get("/auth/csrf", status_code=status.HTTP_204_NO_CONTENT)
async def get_csrf_cookie(response: Response) -> None:
    """Seeds the CSRF double-submit cookie for later cookie-authenticated calls."""
    token = generate_csrf_token()
    response.set_cookie(
        key=settings.csrf_cookie_name,
        value=token,
        httponly=False,
        secure=settings.jwt_refresh_cookie_secure,
        samesite="lax",
    )


@router.post("/auth/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
async def register(payload: RegisterRequest, response: Response, db: DbSession) -> AuthResponse:
    user, access, refresh = await auth_service.register(
        db, email=payload.email, password=payload.password
    )
    _set_refresh_cookie(response, refresh)
    return AuthResponse(user=UserRead.model_validate(user), access=access)


@router.post("/auth/login", response_model=AuthResponse)
async def login(payload: LoginRequest, response: Response, db: DbSession) -> AuthResponse:
    user, access, refresh = await auth_service.authenticate(
        db, email=payload.email, password=payload.password
    )
    _set_refresh_cookie(response, refresh)
    return AuthResponse(user=UserRead.model_validate(user), access=access)


@router.post("/auth/refresh", response_model=RefreshResponse)
async def refresh(request: Request, response: Response, db: DbSession) -> RefreshResponse:
    require_csrf(request)
    raw_refresh = request.cookies.get(settings.jwt_refresh_cookie_name)
    if not raw_refresh:
        raise AuthenticationError("No refresh token cookie present.")
    new_access, new_refresh = await auth_service.refresh_tokens(db, raw_refresh_token=raw_refresh)
    _set_refresh_cookie(response, new_refresh)
    return RefreshResponse(access=new_access)


@router.post("/auth/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    request: Request, response: Response, db: DbSession, current_user: CurrentUser
) -> None:
    require_csrf(request)
    raw_refresh = request.cookies.get(settings.jwt_refresh_cookie_name)
    await auth_service.logout(db, raw_refresh_token=raw_refresh)
    _clear_refresh_cookie(response)
