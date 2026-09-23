"""
Test fixtures.

Earlier iteration tried the classic "nested SAVEPOINT shared between the test and the app"
isolation recipe, but our services call `await db.commit()` mid-request (deliberate — see
app/services/*), and sharing one AsyncSession between test-setup code and the app's request
handling under that recipe produced flaky "another operation is in progress" / "attached to a
different loop" errors (asyncpg connections don't tolerate that kind of interleaving well). Fixed
by using the simpler, standard pattern instead: the test's `db_session` and the running app use
their OWN separate sessions against the same real test database (both already point at it via the
DATABASE_URL_ASYNC env var), and tables are truncated after each test rather than rolled back.
Slightly slower than a rollback-based approach but far more robust for an async web app.
"""

import os
from collections.abc import AsyncGenerator

# httpx's ASGI test client sends Host: test; must be set before app.main is imported.
os.environ.setdefault("ALLOWED_HOSTS", "test,localhost,127.0.0.1")

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.core.config import get_settings
from app.core.security import create_access_token, hash_password
from app.main import app
from app.models.user import User, UserProfile

settings = get_settings()

# NullPool: every checkout is a brand-new connection, never a possibly-stale pooled one held
# across event-loop or test boundaries -- the thing that caused the earlier hang (idle-in-
# transaction connections a QueuePool had cached were blocking a later TRUNCATE's table lock).
_test_engine = create_async_engine(settings.database_url, poolclass=NullPool)
_test_session_factory = async_sessionmaker(bind=_test_engine, expire_on_commit=False)

# Children first, so CASCADE isn't strictly required, but TRUNCATE ... CASCADE handles ordering
# regardless -- listed for readability.
APP_TABLES = [
    "decisions_alternativescore",
    "refresh_tokens",
    "decisions_alternative",
    "decisions_criterion",
    "decisions_decision",
    "accounts_userprofile",
    "accounts_user",
]


@pytest_asyncio.fixture(autouse=True)
async def _clean_tables_after_test() -> AsyncGenerator[None, None]:
    yield
    # DELETE, not TRUNCATE: TRUNCATE needs an ACCESS EXCLUSIVE table lock and will hang
    # indefinitely if anything else still holds a lock; DELETE only needs row-level locks.
    async with _test_session_factory() as session:
        for table in APP_TABLES:
            await session.execute(text(f'DELETE FROM "{table}"'))
        await session.commit()


@pytest_asyncio.fixture
async def db_session() -> AsyncGenerator[AsyncSession, None]:
    async with _test_session_factory() as session:
        yield session
        await session.rollback()  # in case a test left an uncommitted read transaction open
        await session.close()


@pytest_asyncio.fixture
async def client() -> AsyncGenerator[AsyncClient, None]:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest_asyncio.fixture
async def user(db_session: AsyncSession) -> User:
    import uuid

    u = User(
        email=f"user-{uuid.uuid4().hex[:8]}@example.com",
        password_hash=hash_password("TestPassw0rd!23"),
    )
    db_session.add(u)
    await db_session.commit()  # must commit (not just flush): the app uses a separate connection
    db_session.add(UserProfile(user_id=u.id))
    await db_session.commit()
    await db_session.refresh(u, attribute_names=["profile"])
    return u


@pytest.fixture
def auth_headers(user: User) -> dict[str, str]:
    access = create_access_token(user.id)
    return {"Authorization": f"Bearer {access}"}
