"""
UC-01 Register, UC-02 Authenticate — FR-001/002.

Token storage per ADR-0001: access token in the response body only (frontend keeps it in
memory); refresh token in an httpOnly cookie, rotated on every refresh and blacklisted on
logout/rotation. Refresh/logout are cookie-authenticated so they are explicitly re-protected
with Django's CSRF check (DRF's APIView.as_view() marks views csrf_exempt by default; the
method_decorator below re-enables enforcement for just these two views).
"""

from django.conf import settings
from django.middleware.csrf import get_token
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_protect, ensure_csrf_cookie
from rest_framework import status
from rest_framework.exceptions import AuthenticationFailed
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken

from apps.common.exceptions import ConflictError
from apps.common.throttling import AuthRateThrottle

from .models import User
from .serializers import (
    LoginSerializer,
    ProfileUpdateSerializer,
    RegisterSerializer,
    UserSerializer,
)


def _set_refresh_cookie(response: Response, refresh_token: str) -> None:
    response.set_cookie(
        key=settings.JWT_REFRESH_COOKIE_NAME,
        value=refresh_token,
        httponly=True,
        secure=settings.JWT_REFRESH_COOKIE_SECURE,
        samesite="Lax",
        path=settings.JWT_REFRESH_COOKIE_PATH,
        max_age=int(settings.SIMPLE_JWT["REFRESH_TOKEN_LIFETIME"].total_seconds()),
    )


def _clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(settings.JWT_REFRESH_COOKIE_NAME, path=settings.JWT_REFRESH_COOKIE_PATH)


def _tokens_for_user(user: User) -> tuple[str, str]:
    refresh = RefreshToken.for_user(user)
    return str(refresh.access_token), str(refresh)


class CsrfCookieView(APIView):
    """GET /auth/csrf — seeds the CSRF cookie for later cookie-authenticated calls (ADR-0001)."""

    permission_classes = [AllowAny]

    @method_decorator(ensure_csrf_cookie)
    def get(self, request):
        get_token(request)
        return Response(status=status.HTTP_204_NO_CONTENT)


class RegisterView(APIView):
    """API-01 POST /auth/register."""

    permission_classes = [AllowAny]
    throttle_classes = [AuthRateThrottle]

    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data["email"]
        if User.objects.filter(email__iexact=email).exists():
            raise ConflictError("An account with this email already exists.")
        user = serializer.save()
        access, refresh = _tokens_for_user(user)
        response = Response(
            {"user": UserSerializer(user).data, "access": access}, status=status.HTTP_201_CREATED
        )
        _set_refresh_cookie(response, refresh)
        return response


class LoginView(APIView):
    """API-02 POST /auth/login."""

    permission_classes = [AllowAny]
    throttle_classes = [AuthRateThrottle]

    def post(self, request):
        serializer = LoginSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data["user"]
        access, refresh = _tokens_for_user(user)
        response = Response({"user": UserSerializer(user).data, "access": access})
        _set_refresh_cookie(response, refresh)
        return response


@method_decorator(csrf_protect, name="dispatch")
class RefreshView(APIView):
    """API-03 POST /auth/refresh — rotates the refresh cookie, returns a new access token."""

    permission_classes = [AllowAny]

    def post(self, request):
        raw_refresh = request.COOKIES.get(settings.JWT_REFRESH_COOKIE_NAME)
        if not raw_refresh:
            raise AuthenticationFailed("No refresh token cookie present.")
        try:
            refresh = RefreshToken(raw_refresh)
            user = User.objects.get(id=refresh[settings.SIMPLE_JWT["USER_ID_CLAIM"]])
            if settings.SIMPLE_JWT["BLACKLIST_AFTER_ROTATION"]:
                refresh.blacklist()
            rotated = RefreshToken.for_user(user)
            new_refresh = str(rotated)
            access = str(rotated.access_token)
        except (TokenError, User.DoesNotExist) as exc:
            raise AuthenticationFailed("Refresh token is invalid or expired.") from exc

        response = Response({"access": access})
        _set_refresh_cookie(response, new_refresh)
        return response


@method_decorator(csrf_protect, name="dispatch")
class LogoutView(APIView):
    """API-04 POST /auth/logout — blacklists the refresh token, clears the cookie."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        raw_refresh = request.COOKIES.get(settings.JWT_REFRESH_COOKIE_NAME)
        if raw_refresh:
            try:
                RefreshToken(raw_refresh).blacklist()
            except TokenError:
                pass
        response = Response(status=status.HTTP_204_NO_CONTENT)
        _clear_refresh_cookie(response)
        return response


class MeView(APIView):
    """API-05 GET /me, API-06 PATCH /me/profile."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(UserSerializer(request.user).data)

    def patch(self, request):
        serializer = ProfileUpdateSerializer(request.user.profile, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(UserSerializer(request.user).data)


class DeleteAccountView(APIView):
    """API-07 POST /me/delete — SEC-07, BR-014; hard delete per ADR-0002."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        request.user.delete()
        response = Response(status=status.HTTP_204_NO_CONTENT)
        _clear_refresh_cookie(response)
        return response
