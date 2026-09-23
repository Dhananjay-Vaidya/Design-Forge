from django.contrib.auth import authenticate
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers
from rest_framework.exceptions import AuthenticationFailed

from .models import User, UserProfile


class ProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserProfile
        fields = ["display_name", "timezone", "quota_tier", "preferences"]
        read_only_fields = ["quota_tier"]


class UserSerializer(serializers.ModelSerializer):
    profile = ProfileSerializer(read_only=True)

    class Meta:
        model = User
        fields = ["id", "email", "created_at", "profile"]
        read_only_fields = fields


class RegisterSerializer(serializers.ModelSerializer):
    """
    UC-01 Register — VLD-01 (email syntactically valid), VLD-02 (password strength).
    Email *uniqueness* is checked in the view, not here, so a duplicate maps to
    409 ERR-CONFLICT rather than 400 ERR-VALIDATION (SRS UC-01 exception table).
    """

    # Declared explicitly (rather than left to ModelSerializer auto-generation) so DRF does not
    # attach its automatic UniqueValidator for the model's unique=True email field — a duplicate
    # must surface as 409 ERR-CONFLICT from the view, not 400 ERR-VALIDATION (SRS UC-01).
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, min_length=10)

    class Meta:
        model = User
        fields = ["email", "password"]

    def validate_email(self, value: str) -> str:
        return value.strip().lower()

    def validate_password(self, value: str) -> str:
        validate_password(value)
        return value

    def create(self, validated_data) -> User:
        return User.objects.create_user(**validated_data)


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, trim_whitespace=False)

    def validate(self, attrs):
        user = authenticate(
            request=self.context.get("request"),
            username=attrs["email"].strip().lower(),
            password=attrs["password"],
        )
        if user is None or not user.is_active:
            raise AuthenticationFailed("Invalid email or password.")
        attrs["user"] = user
        return attrs


class ProfileUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserProfile
        fields = ["display_name", "timezone", "preferences"]
