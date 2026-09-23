.PHONY: setup up down logs migrate seed test lint format backend-shell frontend-shell clean observability-up observability-down observability-logs prometheus-check prometheus-targets test-observability grafana-restart destroy-volumes

setup:
	cp -n .env.example .env || true
	@echo "Edit .env with local values, then run 'make up'."

up:
	docker compose up -d --build
	docker compose ps

down:
	docker compose down

logs:
	docker compose logs -f

migrate:
	docker compose exec web python manage.py migrate

seed:
	docker compose exec web python manage.py seed_demo

test:
	docker compose exec web pytest -q
	docker compose exec frontend npm run test -- --run

lint:
	docker compose exec web ruff check .
	docker compose exec web black --check .
	docker compose exec frontend npm run lint

format:
	docker compose exec web ruff check --fix .
	docker compose exec web black .
	docker compose exec frontend npm run format

backend-shell:
	docker compose exec web /bin/bash

frontend-shell:
	docker compose exec frontend /bin/sh

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
	docker compose exec web pytest -q tests/observability

grafana-restart:
	docker compose restart grafana

# Destructive: removes named volumes (database, redis, grafana, prometheus data).
# Requires explicit confirmation; not aliased to `clean`.
destroy-volumes:
	@echo "This will PERMANENTLY DELETE all local data volumes."
	@read -p "Type 'yes' to continue: " confirm && [ "$$confirm" = "yes" ] || (echo "Aborted." && exit 1)
	docker compose down -v
