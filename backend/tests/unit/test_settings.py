import pytest
from pydantic import ValidationError
from sqlalchemy.engine import make_url

from app.core.config import Settings


def test_database_host_override_preserves_credentials(monkeypatch):
    monkeypatch.setenv("DATABASE_HOST_OVERRIDE", "host.docker.internal")
    monkeypatch.setenv(
        "DATABASE_URL_ASYNC", "postgresql+asyncpg://user:p%40ss@localhost:5433/localdb"
    )
    monkeypatch.setenv(
        "DATABASE_URL_SYNC", "postgresql+psycopg://user:p%40ss@localhost:5433/localdb"
    )
    settings = Settings()
    for value in (settings.database_url, settings.sync_database_url):
        url = make_url(value)
        assert (url.host, url.port, url.database, url.password) == (
            "host.docker.internal",
            5433,
            "localdb",
            "p@ss",
        )


def test_database_host_override_derives_sync_url(monkeypatch):
    monkeypatch.setenv("DATABASE_HOST_OVERRIDE", "host.docker.internal")
    monkeypatch.setenv(
        "DATABASE_URL_ASYNC", "postgresql+asyncpg://user:password@localhost:5432/localdb"
    )
    url = make_url(Settings(DATABASE_URL_SYNC=None).sync_database_url)
    assert url.drivername == "postgresql+psycopg"
    assert url.host == "host.docker.internal"


def test_csv_env_lists_are_parsed(monkeypatch):
    monkeypatch.setenv("ALLOWED_HOSTS", "localhost,127.0.0.1,web")
    monkeypatch.setenv("CORS_ALLOWED_ORIGINS", "http://a.example, http://b.example")
    s = Settings()
    assert s.allowed_hosts == ["localhost", "127.0.0.1", "web"]
    assert s.cors_allowed_origins == ["http://a.example", "http://b.example"]


def test_legacy_django_env_names_still_accepted(monkeypatch):
    monkeypatch.delenv("ALLOWED_HOSTS", raising=False)
    monkeypatch.setenv("DJANGO_ALLOWED_HOSTS", "legacy.example")
    assert Settings().allowed_hosts == ["legacy.example"]


def _prod(monkeypatch, **overrides):
    env = {
        "ENVIRONMENT": "production",
        "DEBUG": "0",
        "JWT_SECRET_KEY": "x" * 40,
        "JWT_REFRESH_COOKIE_SECURE": "1",
        "CORS_ALLOWED_ORIGINS": "https://app.example",
        "ALLOWED_HOSTS": "api.example",
        "GEMINI_ENABLED": "0",
    } | overrides
    for k, v in env.items():
        monkeypatch.setenv(k, v)
    return Settings()


def test_valid_production_config_loads(monkeypatch):
    assert _prod(monkeypatch).environment == "production"


@pytest.mark.parametrize(
    "override",
    [
        {"JWT_SECRET_KEY": "insecure-dev-jwt-secret-change-me"},
        {"JWT_SECRET_KEY": "short"},
        {"DEBUG": "1"},
        {"JWT_REFRESH_COOKIE_SECURE": "0"},
        {"CORS_ALLOWED_ORIGINS": "*"},
        {"ALLOWED_HOSTS": "*"},
        {"GEMINI_ENABLED": "1", "GEMINI_API_KEY": ""},
    ],
)
def test_insecure_production_config_fails_at_startup(monkeypatch, override):
    with pytest.raises(ValidationError):
        _prod(monkeypatch, **override)
