"""
Base Django settings for DecisionForge AI.

Traces to docs/03-system-architecture.md §4 (module architecture),
docs/04-database-design.md, docs/09-security-and-privacy.md.
All secrets/hosts/ports/model names are read from environment variables
(BRD implementation constraint #12) — see .env.example for the full list.
"""

from datetime import timedelta
from pathlib import Path

import environ

BASE_DIR = Path(__file__).resolve().parent.parent.parent

env = environ.Env()
env_file = BASE_DIR / ".env"
if env_file.exists():
    environ.Env.read_env(str(env_file))

SECRET_KEY = env.str("DJANGO_SECRET_KEY", default="insecure-dev-key-change-me")
DEBUG = env.bool("DJANGO_DEBUG", default=False)
ALLOWED_HOSTS = env.list("DJANGO_ALLOWED_HOSTS", default=["localhost", "127.0.0.1"])

# ---------------------------------------------------------------------------
# Applications
# ---------------------------------------------------------------------------
DJANGO_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
]

THIRD_PARTY_APPS = [
    "django_prometheus",
    "rest_framework",
    "rest_framework_simplejwt",
    "rest_framework_simplejwt.token_blacklist",
    "corsheaders",
    "django_filters",
    "drf_spectacular",
    "django_celery_beat",
]

LOCAL_APPS = [
    "apps.common",
    "apps.accounts",
    "apps.decisions",
    "apps.scoring",
    "apps.snapshots",
    "apps.ai",
    "apps.outcomes",
    "apps.activity",
    "apps.observability",
]

INSTALLED_APPS = DJANGO_APPS + THIRD_PARTY_APPS + LOCAL_APPS

MIDDLEWARE = [
    "django_prometheus.middleware.PrometheusBeforeMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    "apps.common.middleware.RequestIDMiddleware",
    "django_prometheus.middleware.PrometheusAfterMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

# ---------------------------------------------------------------------------
# Database — docs/04-database-design.md
# ---------------------------------------------------------------------------
DATABASES = {
    "default": env.db_url(
        "DATABASE_URL",
        default=(
            f"postgres://{env.str('POSTGRES_USER', 'decisionforge')}:"
            f"{env.str('POSTGRES_PASSWORD', 'decisionforge')}@"
            f"{env.str('POSTGRES_HOST', 'db')}:{env.str('POSTGRES_PORT', '5432')}/"
            f"{env.str('POSTGRES_DB', 'decisionforge')}"
        ),
    )
}

AUTH_USER_MODEL = "accounts.User"

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
        "OPTIONS": {"min_length": 10},
    },
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

# ---------------------------------------------------------------------------
# I18N / TZ
# ---------------------------------------------------------------------------
LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

# ---------------------------------------------------------------------------
# Static files
# ---------------------------------------------------------------------------
STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
STORAGES = {
    "staticfiles": {"BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage"},
}

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# ---------------------------------------------------------------------------
# REST Framework — docs/05-api-specification.md
# ---------------------------------------------------------------------------
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": ("rest_framework.permissions.IsAuthenticated",),
    "DEFAULT_PAGINATION_CLASS": "apps.common.pagination.StandardPagination",
    "PAGE_SIZE": 20,
    "DEFAULT_FILTER_BACKENDS": ("django_filters.rest_framework.DjangoFilterBackend",),
    "EXCEPTION_HANDLER": "apps.common.exceptions.envelope_exception_handler",
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "DEFAULT_THROTTLE_CLASSES": ("apps.common.throttling.UserWriteRateThrottle",),
    "DEFAULT_THROTTLE_RATES": {
        "user_write": "120/minute",
        "auth": "20/minute",
        "ai_analysis": "30/minute",
    },
    "TEST_REQUEST_DEFAULT_FORMAT": "json",
}

SPECTACULAR_SETTINGS = {
    "TITLE": "DecisionForge AI API",
    "DESCRIPTION": "Deterministic decision scoring with optional Gemini advisory analysis.",
    "VERSION": "1.0.0",
    "SERVE_INCLUDE_SCHEMA": False,
    "SCHEMA_PATH_PREFIX": "/api/v1",
}

# ---------------------------------------------------------------------------
# JWT / auth — ADR-0001 (docs/architecture-decision-records/0001-auth-token-storage.md)
# ---------------------------------------------------------------------------
SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(
        minutes=env.int("JWT_ACCESS_TOKEN_LIFETIME_MINUTES", default=15)
    ),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=env.int("JWT_REFRESH_TOKEN_LIFETIME_DAYS", default=7)),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "UPDATE_LAST_LOGIN": True,
    "AUTH_HEADER_TYPES": ("Bearer",),
    "USER_ID_FIELD": "id",
    "USER_ID_CLAIM": "user_id",
}

JWT_REFRESH_COOKIE_NAME = env.str("JWT_REFRESH_COOKIE_NAME", default="df_refresh")
JWT_REFRESH_COOKIE_SECURE = env.bool("JWT_REFRESH_COOKIE_SECURE", default=False)
JWT_REFRESH_COOKIE_PATH = "/api/v1/auth/"

# ---------------------------------------------------------------------------
# CORS / CSRF — docs/09-security-and-privacy.md §6
# ---------------------------------------------------------------------------
CORS_ALLOWED_ORIGINS = env.list("CORS_ALLOWED_ORIGINS", default=["http://localhost:5173"])
CORS_ALLOW_CREDENTIALS = True

CSRF_TRUSTED_ORIGINS = env.list("CSRF_TRUSTED_ORIGINS", default=["http://localhost:5173"])
CSRF_COOKIE_NAME = "df_csrftoken"
CSRF_HEADER_NAME = "HTTP_X_CSRFTOKEN"
CSRF_COOKIE_HTTPONLY = False  # must be readable by frontend JS to echo in the header
CSRF_COOKIE_SAMESITE = "Lax"
CSRF_COOKIE_SECURE = JWT_REFRESH_COOKIE_SECURE

SESSION_COOKIE_SAMESITE = "Lax"

# ---------------------------------------------------------------------------
# Celery — docs/03-system-architecture.md §9
# ---------------------------------------------------------------------------
CELERY_BROKER_URL = env.str("CELERY_BROKER_URL", default="redis://redis:6379/0")
CELERY_RESULT_BACKEND = env.str("CELERY_RESULT_BACKEND", default="redis://redis:6379/1")
CELERY_ACCEPT_CONTENT = ["json"]
CELERY_TASK_SERIALIZER = "json"
CELERY_RESULT_SERIALIZER = "json"
CELERY_TIMEZONE = TIME_ZONE
CELERY_TASK_ALWAYS_EAGER = env.bool("CELERY_TASK_ALWAYS_EAGER", default=False)

REDIS_URL = env.str("REDIS_URL", default="redis://redis:6379/0")

# ---------------------------------------------------------------------------
# Gemini / AI — docs/06-gemini-integration-design.md §3
# ---------------------------------------------------------------------------
GEMINI_ENABLED = env.bool("GEMINI_ENABLED", default=False)
GEMINI_API_KEY = env.str("GEMINI_API_KEY", default="")
GEMINI_MODEL = env.str("GEMINI_MODEL", default="gemini-2.5-flash")
GEMINI_FALLBACK_MODEL = env.str("GEMINI_FALLBACK_MODEL", default="gemini-2.5-flash-lite")
GEMINI_TIMEOUT_SECONDS = env.int("GEMINI_TIMEOUT_SECONDS", default=20)
GEMINI_MAX_RETRIES = env.int("GEMINI_MAX_RETRIES", default=3)
GEMINI_DAILY_USER_QUOTA = env.int("GEMINI_DAILY_USER_QUOTA", default=20)
GEMINI_CACHE_TTL_SECONDS = env.int("GEMINI_CACHE_TTL_SECONDS", default=86400)
GEMINI_BREAKER_FAILURE_THRESHOLD = env.int("GEMINI_BREAKER_FAILURE_THRESHOLD", default=5)
GEMINI_BREAKER_WINDOW_SECONDS = env.int("GEMINI_BREAKER_WINDOW_SECONDS", default=120)
GEMINI_BREAKER_COOLDOWN_SECONDS = env.int("GEMINI_BREAKER_COOLDOWN_SECONDS", default=60)

# ---------------------------------------------------------------------------
# Business-rule constants — docs/14-assumptions-open-questions.md D-1..D-4
# ---------------------------------------------------------------------------
SCORE_MIN = 1
SCORE_MAX = 10
CONFIDENCE_MIN = 0
CONFIDENCE_MAX = 100
SATISFACTION_MIN = 1
SATISFACTION_MAX = 5
LIKELIHOOD_IMPACT_MIN = 1
LIKELIHOOD_IMPACT_MAX = 5

DEMO_SEED_ENABLED = env.bool("DEMO_SEED_ENABLED", default=True)
ENABLE_METRICS = env.bool("ENABLE_METRICS", default=True)
PROMETHEUS_METRICS_ENABLED = env.bool("PROMETHEUS_METRICS_ENABLED", default=True)

# ---------------------------------------------------------------------------
# Logging — docs/09-security-and-privacy.md §10 (redaction)
# ---------------------------------------------------------------------------
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "filters": {
        "redact_secrets": {"()": "apps.common.logging.RedactSecretsFilter"},
    },
    "formatters": {
        "default": {
            "format": "%(asctime)s %(levelname)s %(name)s [request_id=%(request_id)s] %(message)s",
            "()": "apps.common.logging.RequestIDLogFormatter",
        },
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "filters": ["redact_secrets"],
            "formatter": "default",
        },
    },
    "root": {"handlers": ["console"], "level": "INFO"},
    "loggers": {
        "django": {"handlers": ["console"], "level": "INFO", "propagate": False},
        "apps": {"handlers": ["console"], "level": "INFO", "propagate": False},
    },
}
