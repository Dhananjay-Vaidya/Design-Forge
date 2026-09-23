from django.urls import path

from . import views

urlpatterns = [
    path("healthz", views.healthz, name="healthz"),
    path("health", views.healthz, name="health"),
    path("readyz", views.readyz, name="readyz"),
    path("ready", views.readyz, name="ready"),
]
