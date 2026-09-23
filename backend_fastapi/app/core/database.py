"""
Async SQLAlchemy engine/session — replaces Django's ORM connection handling.

One engine for the process lifetime; one AsyncSession per request, closed (not just committed)
at the end of the request regardless of outcome. Routes never see the engine directly.
"""

from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.core.config import get_settings

settings = get_settings()

# Postgres-standard naming convention so Alembic autogenerate produces stable, predictable
# constraint names (SQLAlchemy has no default naming convention, unlike Django).
NAMING_CONVENTION = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    pass


Base.metadata.naming_convention = NAMING_CONVENTION

_engine: AsyncEngine = create_async_engine(
    settings.database_url,
    pool_size=settings.db_pool_size,
    max_overflow=settings.db_max_overflow,
    pool_pre_ping=True,
)

_session_factory = async_sessionmaker(bind=_engine, expire_on_commit=False, autoflush=False)


def get_engine() -> AsyncEngine:
    return _engine


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency: one session per request, always closed."""
    async with _session_factory() as session:
        try:
            yield session
        finally:
            await session.close()


async def check_database_connection() -> bool:
    from sqlalchemy import text

    try:
        async with _engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        return True
    except Exception:
        return False
