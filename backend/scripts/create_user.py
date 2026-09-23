#!/usr/bin/env python
"""
Create a user (replaces `manage.py createsuperuser` for the regular-user case).

    python -m scripts.create_user EMAIL            # password read from DF_PASSWORD or prompted
    DF_PASSWORD=... python -m scripts.create_user EMAIL

There is deliberately no admin role or admin UI: Django Admin was never used by the product
(docs/fastapi-migration-audit.md section 12).
"""

import asyncio
import getpass
import os
import sys

from app.core.database import get_engine, get_session_factory
from app.core.exceptions import AppError
from app.schemas.user import RegisterRequest
from app.services import auth_service


async def create_user(email: str, password: str) -> None:
    RegisterRequest(email=email, password=password)  # same validation the API applies
    async with get_session_factory()() as db:
        user, _access, _refresh = await auth_service.register(db, email=email, password=password)
    print(f"Created user {user.email} ({user.id})")


def main() -> int:
    if len(sys.argv) != 2:
        print(__doc__)
        return 2
    password = os.environ.get("DF_PASSWORD") or getpass.getpass("Password: ")

    async def run() -> None:
        try:
            await create_user(sys.argv[1], password)
        finally:
            await get_engine().dispose()

    try:
        asyncio.run(run())
    except AppError as exc:
        print(f"Error: {exc.message}")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
