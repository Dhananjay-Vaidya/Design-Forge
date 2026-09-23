"""
Password hashing, JWT issuing/verification, and CSRF double-submit checking.
Mechanism decisions recorded in docs/adr/ADR-fastapi-authentication.md.
"""

from __future__ import annotations

import hashlib
import hmac
import secrets
import uuid
from datetime import UTC, datetime, timedelta
from enum import StrEnum

import jwt
from pwdlib import PasswordHash
from pwdlib.hashers.argon2 import Argon2Hasher
from starlette.requests import Request

from app.core.config import get_settings
from app.core.exceptions import AuthenticationError, AuthorizationError

settings = get_settings()

_password_hash = PasswordHash((Argon2Hasher(),))


class TokenType(StrEnum):
    ACCESS = "access"
    REFRESH = "refresh"


# ---------------------------------------------------------------------------
# Passwords
# ---------------------------------------------------------------------------


def hash_password(plain_password: str) -> str:
    """Always hashes new/changed passwords with Argon2 (pwdlib)."""
    return _password_hash.hash(plain_password)


def _verify_django_pbkdf2(plain_password: str, encoded: str) -> bool:
    """
    Verifies Django's `pbkdf2_sha256$<iterations>$<salt>$<hash_b64>` format, so a database
    adopted from the Django backend (docs/adr/ADR-fastapi-database-migration.md) doesn't lock
    out existing users before their first successful login re-hashes them to Argon2.
    """
    import base64

    try:
        algorithm, iterations_str, salt, hash_b64 = encoded.split("$", 3)
        if algorithm != "pbkdf2_sha256":
            return False
        iterations = int(iterations_str)
        expected = base64.b64decode(hash_b64 + "==")
        computed = hashlib.pbkdf2_hmac(
            "sha256", plain_password.encode(), salt.encode(), iterations, dklen=len(expected)
        )
        return hmac.compare_digest(computed, expected)
    except (ValueError, TypeError):
        return False


def verify_password(plain_password: str, hashed_password: str) -> tuple[bool, str | None]:
    """
    Returns (is_valid, rehash_needed_to). `rehash_needed_to` is a new Argon2 hash to persist
    when the stored hash was a legacy Django PBKDF2 hash and verification succeeded (lazy
    migration — never forces a rehash on failure).
    """
    if hashed_password.startswith("pbkdf2_sha256$"):
        if _verify_django_pbkdf2(plain_password, hashed_password):
            return True, hash_password(plain_password)
        return False, None
    try:
        return _password_hash.verify(plain_password, hashed_password), None
    except Exception:
        return False, None


# ---------------------------------------------------------------------------
# JWT
# ---------------------------------------------------------------------------


def create_access_token(user_id: uuid.UUID) -> str:
    now = datetime.now(UTC)
    payload = {
        "sub": str(user_id),
        "token_type": TokenType.ACCESS.value,
        "iat": now,
        "exp": now + timedelta(minutes=settings.jwt_access_token_lifetime_minutes),
    }
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def create_refresh_token(user_id: uuid.UUID) -> tuple[str, str, datetime]:
    """Returns (token, jti, expires_at). Caller persists (jti, user_id, expires_at) for rotation."""
    now = datetime.now(UTC)
    jti = uuid.uuid4().hex
    expires_at = now + timedelta(days=settings.jwt_refresh_token_lifetime_days)
    payload = {
        "sub": str(user_id),
        "token_type": TokenType.REFRESH.value,
        "jti": jti,
        "iat": now,
        "exp": expires_at,
    }
    token = jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)
    return token, jti, expires_at


def decode_token(token: str, *, expected_type: TokenType) -> dict:
    try:
        payload = jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
    except jwt.PyJWTError as exc:
        raise AuthenticationError("Token is invalid or expired.") from exc
    if payload.get("token_type") != expected_type.value:
        raise AuthenticationError("Unexpected token type.")
    return payload


# ---------------------------------------------------------------------------
# CSRF (double-submit cookie) — required only on the two cookie-authenticated endpoints
# ---------------------------------------------------------------------------


def generate_csrf_token() -> str:
    return secrets.token_urlsafe(32)


def verify_csrf(request: Request) -> None:
    cookie_value = request.cookies.get(settings.csrf_cookie_name)
    header_value = request.headers.get(settings.csrf_header_name)
    if not cookie_value or not header_value or not hmac.compare_digest(cookie_value, header_value):
        raise AuthorizationError("CSRF validation failed.")
