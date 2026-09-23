from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

# NOTE: apps are wired in here as each implementation phase lands them
# (docs/13-claude-code-execution-plan.md §4). Phase 1 = accounts + observability.
# Phase 2 = decisions (CRUD + deterministic ranking).
urlpatterns = [
    path("admin/", admin.site.urls),
    path("", include("apps.observability.urls")),
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path(
        "api/schema/swagger-ui/",
        SpectacularSwaggerView.as_view(url_name="schema"),
        name="swagger-ui",
    ),
    path("api/v1/", include("apps.accounts.urls")),
    path("api/v1/", include("apps.decisions.urls")),
]
