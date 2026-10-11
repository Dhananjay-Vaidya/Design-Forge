# Contact inbox

`POST /api/v1/contact` is public and stores valid, consented messages in PostgreSQL's
`contact_messages` table. It does not send emails or contact data to an external service.
The public email is configured once in `frontend/src/content/site.ts`.

Apply the additive Alembic migration from `backend`:

```powershell
.venv\Scripts\python.exe -m scripts.db_migrate
```

The local database has already been upgraded to `b7c8d9e0f1a2` for this implementation.
Existing decision and account records are preserved. Use the configured backend environment;
container deployments use the existing local-Postgres override when appropriate.

## Read and handle messages

Run these commands from `backend` with its environment loaded:

```powershell
.venv\Scripts\python.exe -m scripts.contact_inbox list
.venv\Scripts\python.exe -m scripts.contact_inbox show <message-uuid>
.venv\Scripts\python.exe -m scripts.contact_inbox handled <message-uuid>
.venv\Scripts\python.exe -m scripts.contact_inbox delete <message-uuid>
```

Or, with the running backend container:

```powershell
docker compose exec web python -m scripts.contact_inbox list
docker compose exec web python -m scripts.contact_inbox show <message-uuid>
```

`list` prints only metadata for the newest 100 messages. `show` deliberately displays the
selected message's personal details for the owner; keep that terminal output private.
There is no public inbox read endpoint. `handled` records that you processed a message;
`delete` removes it. This version has no automatic contact retention period or email notification.
Replies are manual using the submitted email address.

## Abuse protection and metrics

The backend defaults to three attempts per visitor per minute and 60 attempts globally per minute.
Both counters are atomic in Redis and expire automatically. Invalid and spam attempts count toward
those limits. A filled `website` honeypot returns `{ "ok": true }` without storing a message.
An unavailable rate-limit store temporarily rejects submissions rather than removing protection.
The response includes a friendly error and `Retry-After` for HTTP 429.

Configure `CONTACT_RATE_PER_MINUTE`, `CONTACT_GLOBAL_PER_MINUTE`, and
`CONTACT_TRUST_FORWARDED_FOR` in the backend environment. Leave forwarding trust off unless your
trusted reverse proxy overwrites `X-Forwarded-For`. Contact records contain a keyed SHA-256 IP hash,
never the raw IP address. Application logs omit names, emails, and message bodies, including database
failure details that could contain SQL parameters.

Prometheus scrapes `decisionforge_contact_submissions_total` with result labels `ok`, `invalid`,
`rate_limited`, and `spam`. Counters appear after that outcome first occurs. For example:

```promql
sum by (result) (increase(decisionforge_contact_submissions_total[1h]))
```

## Test isolation

Backend pytest fixtures delete application records after each test. Run the suite against a fresh
disposable database, **never your normal local application database**, and a separate Redis database
(the implementation was checked with Redis database 15). Upgrade the temporary database before
testing. `alembic check` verifies migration/model agreement; it replaces the brief's Django migration
command because this repository uses FastAPI, SQLAlchemy, and Alembic.
