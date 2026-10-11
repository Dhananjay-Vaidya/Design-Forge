"""Owner-only local inbox: list metadata, explicitly show a message, mark handled, or delete it.

Run from backend: python -m scripts.contact_inbox list
No public read endpoint and no automatic email sends.
"""

import argparse
import json
import uuid

from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.contact import ContactMessage


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=["list", "show", "handled", "delete"])
    parser.add_argument("id", nargs="?", type=uuid.UUID)
    args = parser.parse_args()
    if args.action != "list" and args.id is None:
        parser.error("Provide the message UUID.")
    engine = create_engine(get_settings().sync_database_url)
    try:
        with Session(engine) as session:
            if args.action == "list":
                rows = session.scalars(
                    select(ContactMessage).order_by(ContactMessage.created_at.desc()).limit(100)
                )
                for row in rows:
                    print(
                        f"{row.id}  {row.created_at.isoformat()}  {row.reason}  handled={row.handled}"
                    )
                return 0
            row = session.get(ContactMessage, args.id)
            if row is None:
                print("Message not found.")
                return 1
            if args.action == "show":
                print(
                    json.dumps(
                        {
                            "id": str(row.id),
                            "name": row.name,
                            "email": row.email,
                            "reason": row.reason,
                            "message": row.message,
                        },
                        ensure_ascii=False,
                        indent=2,
                    )
                )
            elif args.action == "handled":
                row.handled = True
                session.commit()
                print("Marked handled.")
            else:
                session.delete(row)
                session.commit()
                print("Deleted.")
    finally:
        engine.dispose()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
