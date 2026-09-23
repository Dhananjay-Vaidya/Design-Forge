from django.urls import path

from . import views

urlpatterns = [
    path("auth/csrf", views.CsrfCookieView.as_view(), name="auth-csrf"),
    path("auth/register", views.RegisterView.as_view(), name="auth-register"),
    path("auth/login", views.LoginView.as_view(), name="auth-login"),
    path("auth/refresh", views.RefreshView.as_view(), name="auth-refresh"),
    path("auth/logout", views.LogoutView.as_view(), name="auth-logout"),
    path("me", views.MeView.as_view(), name="me"),
    path("me/profile", views.MeView.as_view(), name="me-profile"),
    path("me/delete", views.DeleteAccountView.as_view(), name="me-delete"),
]
