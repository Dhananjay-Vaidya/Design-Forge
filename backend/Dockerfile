FROM python:3.12-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends libpq5 curl \
    && rm -rf /var/lib/apt/lists/*

RUN addgroup --system app && adduser --system --home /home/app --ingroup app app

WORKDIR /app

FROM base AS build-deps
RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential libpq-dev \
    && rm -rf /var/lib/apt/lists/*
COPY requirements/ requirements/
ARG INSTALL_DEV=true
RUN if [ "$INSTALL_DEV" = "true" ]; then pip install --user -r requirements/dev.txt; else pip install --user -r requirements/base.txt; fi

FROM base AS final
COPY --from=build-deps /root/.local /home/app/.local
ENV HOME=/home/app \
    PATH=/home/app/.local/bin:$PATH
COPY . .
RUN chown -R app:app /app /home/app
USER app
EXPOSE 8000
COPY --chown=app:app entrypoint.sh /entrypoint.sh
ENTRYPOINT ["/bin/sh", "/entrypoint.sh"]
CMD ["gunicorn", "app.main:app", "-c", "gunicorn.conf.py"]
