.PHONY: setup up down logs migrate migration db-status seed test test-backend test-frontend lint format typecheck \
	backend-shell frontend-shell openapi verify clean destroy-volumes \
	observability-up observability-down observability-logs prometheus-check prometheus-targets test-observability grafana-restart

# All backend commands run inside the `web` container (FastAPI, Python 3.12).

setup:
	cp -n .env.example .env || true
	@echo "Edit .env with local values (POSTGRES_PASSWORD, JWT_SECRET_KEY, ...), then run 'make up'."

up:
	docker compose up -d --build
	docker compose ps

down:
	docker compose down

logs:
	docker compose logs -f

# Idempotent: upgrades, or adopts a Django-created database (see docs/adr/ADR-fastapi-database-migration.md).
migrate:
	docker compose exec web python -m scripts.db_migrate

# Usage: make migration m="add foo table"   (autogenerate; REVIEW the file before committing)
migration:
	docker compose exec web alembic revision --autogenerate -m "$(m)"

db-status:
	docker compose exec web python -m scripts.db_status

# Requires DF_DEMO_PASSWORD, e.g.: make seed DF_DEMO_PASSWORD='Demo-Passw0rd-123'
seed:
	docker compose exec -e DF_DEMO_PASSWORD="$(DF_DEMO_PASSWORD)" web python -m scripts.seed_demo

test: test-backend test-frontend

test-backend:
	docker compose exec web pytest -q

test-frontend:
	docker compose exec frontend npm run test -- --run

lint:
	docker compose exec web ruff check .
	docker compose exec web ruff format --check .
	docker compose exec frontend npm run lint

format:
	docker compose exec web ruff check --fix .
	docker compose exec web ruff format .
	docker compose exec frontend npm run format

typecheck:
	docker compose exec web mypy app scripts
	docker compose exec frontend npm run typecheck

backend-shell:
	docker compose exec web /bin/bash

frontend-shell:
	docker compose exec frontend /bin/sh

# Regenerates docs/openapi.json (checked by tests/contract/test_openapi_snapshot.py).
openapi:
	docker compose exec web python -m scripts.export_openapi /app/openapi.json
	mv backend/openapi.json docs/openapi.json

# Live end-to-end check against the running stack (throwaway users only).
verify:
	docker compose exec web python -m scripts.verify_e2e http://localhost:8000
	docker compose exec web ruff check .
	docker compose exec web mypy app scripts
	docker compose exec web pytest -q
	docker compose exec frontend npm run lint
	docker compose exec frontend npm run typecheck
	docker compose exec frontend npm run test -- --run

# Safe: stops and removes containers only. Named volumes (database, redis, grafana, prometheus) are kept.
clean:
	docker compose down --remove-orphans

observability-up:
	docker compose up -d --build prometheus grafana postgres-exporter redis-exporter
	docker compose ps prometheus grafana postgres-exporter redis-exporter

observability-down:
	docker compose stop prometheus grafana postgres-exporter redis-exporter

observability-logs:
	docker compose logs -f prometheus grafana postgres-exporter redis-exporter

prometheus-check:
	docker run --rm --entrypoint promtool -v "$$(pwd)/infrastructure/prometheus:/etc/prometheus:ro" prom/prometheus:v2.54.1 check config /etc/prometheus/prometheus.yml
	docker run --rm --entrypoint promtool -v "$$(pwd)/infrastructure/prometheus:/etc/prometheus:ro" prom/prometheus:v2.54.1 check rules /etc/prometheus/recording-rules.yml /etc/prometheus/alerts.yml

prometheus-targets:
	curl -fsS http://localhost:9090/api/v1/targets

test-observability:
	docker compose exec web pytest -q tests/api/test_observability.py

grafana-restart:
	docker compose restart grafana

# Destructive: removes named volumes (database, redis, grafana, prometheus data).
# Requires explicit confirmation; deliberately not aliased to `clean`.
destroy-volumes:
	@echo "This will PERMANENTLY DELETE all local data volumes."
	@read -p "Type 'yes' to continue: " confirm && [ "$$confirm" = "yes" ] || (echo "Aborted." && exit 1)
	docker compose down -v
