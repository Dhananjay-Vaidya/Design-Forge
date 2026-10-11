# Local PostgreSQL

Keep your credentials in `backend/.env`. Set `DATABASE_URL_ASYNC` to
`postgresql+asyncpg://USER:URL_ENCODED_PASSWORD@localhost:5432/DATABASE` and
`DATABASE_URL_SYNC` to the same URL with driver `postgresql+psycopg`.
Keep the `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, and `POSTGRES_PORT`
values consistent with these URLs for the metrics exporter.

## Create or update tables

In PowerShell from the repository root:

```powershell
cd backend
$env:DEBUG = '1'
.\.venv\Scripts\python.exe -m scripts.db_migrate
.\.venv\Scripts\python.exe -m alembic current
cd ..
```

PostgreSQL must be running and the database must already exist. Existing Alembic
migrations create the tables, constraints, and indexes, or upgrade an existing schema.
The command can be repeated. The revision should show `(head)`. Refresh
**Schemas > public > Tables** in pgAdmin afterward. This creates schema; it does
not copy records from the Docker database.

## Run Docker services with PostgreSQL on Windows

From the repository root:

```powershell
docker compose stop db
docker compose --env-file backend/.env -f docker-compose.yml -f docker-compose.dev.yml -f docker-compose.local-postgres.yml up -d --build
```

The override loads `backend/.env` for the API and worker and changes the database
hostname to `host.docker.internal`. PostgreSQL stays on Windows; Redis stays in
Docker. The API also runs migrations automatically on startup. Requires Compose
2.24.4 or newer. Use the same file arguments for subsequent Compose operations.
The old PostgreSQL volume is retained. Use the original Compose command to return
to the Docker database.

For an API running directly on Windows, run from `backend`:

```powershell
$env:DEBUG = '1'
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000
```

This reads `backend/.env` and connects through `localhost`. Configure Redis URLs
separately to reach a Redis server from Windows when running outside Docker.
