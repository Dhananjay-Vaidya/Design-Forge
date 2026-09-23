"""
HTTP request metrics as a pure ASGI middleware (replaces django-prometheus).

Labels are bounded: `route` is the matched route *template* (e.g. `/api/v1/decisions/{decision_id}`),
never the raw path, and requests that match no route collapse to `unmatched`. Nothing derived from
user input (IDs, query strings, headers) is ever used as a label value.
"""

from time import perf_counter

from prometheus_client import Counter, Gauge, Histogram
from starlette.types import ASGIApp, Message, Receive, Scope, Send

HTTP_REQUESTS = Counter(
    "decisionforge_http_requests_total",
    "HTTP requests by method, route template and status code.",
    ["method", "route", "status"],
)
HTTP_REQUEST_DURATION = Histogram(
    "decisionforge_http_request_duration_seconds",
    "HTTP request duration by method and route template.",
    ["method", "route"],
    buckets=(0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10),
)
HTTP_RESPONSE_SIZE = Histogram(
    "decisionforge_http_response_size_bytes",
    "HTTP response body size by route template.",
    ["route"],
    buckets=(128, 512, 2048, 8192, 32768, 131072, 524288, 2097152),
)
HTTP_REQUESTS_IN_PROGRESS = Gauge(
    "decisionforge_http_requests_in_progress",
    "HTTP requests currently being handled.",
    multiprocess_mode="livesum",
)

_KNOWN_METHODS = {"GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"}
_UNTRACKED_ROUTES = {"/metrics"}


class HTTPMetricsMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        method = scope["method"] if scope["method"] in _KNOWN_METHODS else "OTHER"
        status_code = 500
        body_bytes = 0
        start = perf_counter()
        HTTP_REQUESTS_IN_PROGRESS.inc()

        async def send_wrapper(message: Message) -> None:
            nonlocal status_code, body_bytes
            if message["type"] == "http.response.start":
                status_code = message["status"]
            elif message["type"] == "http.response.body":
                body_bytes += len(message.get("body", b""))
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        finally:
            HTTP_REQUESTS_IN_PROGRESS.dec()
            route = getattr(scope.get("route"), "path", None) or "unmatched"
            if route not in _UNTRACKED_ROUTES:
                HTTP_REQUESTS.labels(method=method, route=route, status=str(status_code)).inc()
                HTTP_REQUEST_DURATION.labels(method=method, route=route).observe(
                    perf_counter() - start
                )
                HTTP_RESPONSE_SIZE.labels(route=route).observe(body_bytes)
