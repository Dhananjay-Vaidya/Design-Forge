#!/usr/bin/env python
"""
Seed the demonstration decision "Choose the best master's program for 2027" for a demo user.
Idempotent: re-running with the same user does nothing if the decision already exists.
Not for production databases.

    DF_DEMO_PASSWORD=... python -m scripts.seed_demo        (user: demo@decisionforge.example)
"""

import asyncio
import os
import sys
from decimal import Decimal

from sqlalchemy import select

from app.core.database import get_engine, get_session_factory
from app.models.decision import Decision
from app.models.user import User
from app.services import auth_service, decision_service

DEMO_EMAIL = "demo@decisionforge.example"
TITLE = "Choose the best master's program for 2027"
ALTERNATIVES = ["Carnegie Mellon", "ETH Zurich", "University of Toronto"]
# name, weight, direction
CRITERIA = [
    ("Academic reputation", "8", "benefit"),
    ("Total cost", "6", "cost"),
    ("Career outcomes", "7", "benefit"),
    ("Location & lifestyle", "3", "benefit"),
]
SCORES = {  # alternative -> scores in CRITERIA order
    "Carnegie Mellon": [9, 8, 9, 6],
    "ETH Zurich": [9, 4, 8, 7],
    "University of Toronto": [7, 5, 7, 8],
}


async def seed(password: str) -> None:
    async with get_session_factory()() as db:
        user = (await db.execute(select(User).where(User.email == DEMO_EMAIL))).scalar_one_or_none()
        if user is None:
            user, _a, _r = await auth_service.register(db, email=DEMO_EMAIL, password=password)
            print(f"Created demo user {DEMO_EMAIL}")
        exists = (
            await db.execute(
                select(Decision.id).where(Decision.owner_id == user.id, Decision.title == TITLE)
            )
        ).first()
        if exists:
            print("Demo decision already present; nothing to do.")
            return

        decision = await decision_service.create_decision(
            db,
            owner_id=user.id,
            title=TITLE,
            context="Comparing three graduate programs on reputation, cost, outcomes and lifestyle.",
            category="education",
            deadline=None,
        )
        alts = {}
        for i, name in enumerate(ALTERNATIVES):
            alts[name] = await decision_service.create_alternative(
                db, decision, name=name, description="", position=i
            )
        crits = []
        for i, (name, weight, direction) in enumerate(CRITERIA):
            crits.append(
                await decision_service.create_criterion(
                    db,
                    decision,
                    name=name,
                    weight=Decimal(weight),
                    direction=direction,
                    description="",
                    is_active=True,
                    position=i,
                )
            )
        cells = [
            {"alternative_id": alts[a].id, "criterion_id": crits[i].id, "score": Decimal(s)}
            for a, row in SCORES.items()
            for i, s in enumerate(row)
        ]
        await decision_service.upsert_scores(db, decision, cells)
        print(f"Seeded decision '{TITLE}' ({decision.id})")


def main() -> int:
    password = os.environ.get("DF_DEMO_PASSWORD")
    if not password:
        print("Set DF_DEMO_PASSWORD (min 10 chars) - no default password is baked in.")
        return 2

    async def run() -> None:
        try:
            await seed(password)
        finally:
            await get_engine().dispose()

    asyncio.run(run())
    return 0


if __name__ == "__main__":
    sys.exit(main())
