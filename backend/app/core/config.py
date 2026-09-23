"""
Typed application settings, replacing Django's `config/settings/*.py`.

Every field maps to an env var already documented in the repo root `.env.example`
(see docs/fastapi-migration-audit.md for the Django -> FastAPI variable mapping); no
credential ever has a production-unsafe default, and nothing here is logged (app/core/logging.py
applies the same secret-redaction pattern as the Django implementation).
"""

from decimal import Decimal
from functools import lru_cache
from typing import Annotated

from pydantic import AliasChoices, Field, field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # ---- Application ----
    app_name: str = "DecisionForge AI"
    environment: str = Field(default="development", alias="ENVIRONMENT")
    debug: bool = Field(default=True, validation_alias=AliasChoices("DEBUG", "DJANGO_DEBUG"))
    api_v1_prefix: str = "/api/v1"
    allowed_hosts: Annotated[list[str], NoDecode] = Field(
        default=["localhost", "127.0.0.1"],
        validation_alias=AliasChoices("ALLOWED_HOSTS", "DJANGO_ALLOWED_HOSTS"),
    )

    # ---- Database ----
    database_url: str = Field(
        default="postgresql+asyncpg://decisionforge:decisionforge@db:5432/decisionforge",
        alias="DATABASE_URL_ASYNC",
    )
    # Sync URL for Alembic (psycopg, not asyncpg) — derived if not explicitly set.
    database_url_sync: str | None = Field(default=None, alias="DATABASE_URL_SYNC")
    db_pool_size: int = Field(default=5, alias="DB_POOL_SIZE")
    db_max_overflow: int = Field(default=10, alias="DB_MAX_OVERFLOW")

    # ---- Redis / Celery ----
    redis_url: str = Field(default="redis://redis:6379/0", alias="REDIS_URL")
    celery_broker_url: str = Field(default="redis://redis:6379/0", alias="CELERY_BROKER_URL")
    celery_result_backend: str = Field(
        default="redis://redis:6379/1", alias="CELERY_RESULT_BACKEND"
    )

    # ---- Auth / JWT — ADR docs/adr/ADR-fastapi-authentication.md ----
    jwt_secret_key: str = Field(default="insecure-dev-jwt-secret-change-me", alias="JWT_SECRET_KEY")
    jwt_algorithm: str = "HS256"
    jwt_access_token_lifetime_minutes: int = Field(
        default=15, alias="JWT_ACCESS_TOKEN_LIFETIME_MINUTES"
    )
    jwt_refresh_token_lifetime_days: int = Field(default=7, alias="JWT_REFRESH_TOKEN_LIFETIME_DAYS")
    jwt_refresh_cookie_name: str = Field(default="df_refresh", alias="JWT_REFRESH_COOKIE_NAME")
    jwt_refresh_cookie_secure: bool = Field(default=False, alias="JWT_REFRESH_COOKIE_SECURE")
    jwt_refresh_cookie_path: str = "/api/v1/auth/"
    csrf_cookie_name: str = "df_csrftoken"
    csrf_header_name: str = "X-CSRFToken"

    # ---- CORS ----
    cors_allowed_origins: Annotated[list[str], NoDecode] = Field(
        default=["http://localhost:5173"], alias="CORS_ALLOWED_ORIGINS"
    )

    # ---- Gemini / AI (Phase 3 — not implemented yet; config wired ahead of the feature) ----
    gemini_enabled: bool = Field(default=False, alias="GEMINI_ENABLED")
    gemini_api_key: str = Field(default="", alias="GEMINI_API_KEY")
    gemini_model: str = Field(default="gemini-2.5-flash", alias="GEMINI_MODEL")
    gemini_fallback_model: str = Field(
        default="gemini-2.5-flash-lite", alias="GEMINI_FALLBACK_MODEL"
    )
    gemini_timeout_seconds: int = Field(default=20, alias="GEMINI_TIMEOUT_SECONDS")
    gemini_max_retries: int = Field(default=3, alias="GEMINI_MAX_RETRIES")
    gemini_daily_user_quota: int = Field(default=20, alias="GEMINI_DAILY_USER_QUOTA")
    gemini_cache_ttl_seconds: int = Field(default=86400, alias="GEMINI_CACHE_TTL_SECONDS")
    ai_concurrency_limit: int = Field(default=5, alias="AI_CONCURRENCY_LIMIT")
    gemini_breaker_failure_threshold: int = Field(
        default=5, alias="GEMINI_BREAKER_FAILURE_THRESHOLD"
    )
    gemini_breaker_window_seconds: int = Field(default=120, alias="GEMINI_BREAKER_WINDOW_SECONDS")
    gemini_breaker_cooldown_seconds: int = Field(
        default=60, alias="GEMINI_BREAKER_COOLDOWN_SECONDS"
    )

    # ---- Observability ----
    prometheus_metrics_enabled: bool = Field(
        default=True, validation_alias=AliasChoices("ENABLE_METRICS", "PROMETHEUS_METRICS_ENABLED")
    )
    log_level: str = Field(default="INFO", alias="LOG_LEVEL")

    # ---- Business-rule constants — docs/14-assumptions-open-questions.md D-1..D-4 ----
    score_min: Decimal = Decimal("1")
    score_max: Decimal = Decimal("10")
    confidence_min: int = 0
    confidence_max: int = 100
    satisfaction_min: int = 1
    satisfaction_max: int = 5

    @field_validator("allowed_hosts", "cors_allowed_origins", mode="before")
    @classmethod
    def _split_csv(cls, value):
        if isinstance(value, str):
            return [item.strip() for item in value.split(",") if item.strip()]
        return value

    @model_validator(mode="after")
    def _validate_production(self) -> "Settings":
        """Fail fast at startup if a production deployment is misconfigured."""
        if self.environment.lower() != "production":
            return self
        problems = []
        if self.jwt_secret_key.startswith("insecure-") or len(self.jwt_secret_key) < 32:
            problems.append(
                "JWT_SECRET_KEY must be set to a random value of at least 32 characters"
            )
        if self.debug:
            problems.append("DEBUG must be off")
        if not self.jwt_refresh_cookie_secure:
            problems.append("JWT_REFRESH_COOKIE_SECURE must be enabled")
        if "*" in self.cors_allowed_origins or "*" in self.allowed_hosts:
            problems.append("wildcard CORS origins / allowed hosts are not permitted")
        if self.gemini_enabled and not self.gemini_api_key:
            problems.append("GEMINI_API_KEY is required when GEMINI_ENABLED is on")
        if problems:
            raise ValueError("Invalid production configuration: " + "; ".join(problems))
        return self

    @property
    def sync_database_url(self) -> str:
        if self.database_url_sync:
            return self.database_url_sync
        return self.database_url.replace("postgresql+asyncpg://", "postgresql+psycopg://")


@lru_cache
def get_settings() -> Settings:
    return Settings()
