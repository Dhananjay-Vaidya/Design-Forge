"""
Pydantic v2 schemas for accounts — mirrors apps/accounts/serializers.py (Django) field-for-field
so the response bodies the frontend already parses (frontend/src/types/auth.ts) don't change.
"""

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


class UserProfileRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    display_name: str
    timezone: str
    quota_tier: str
    preferences: dict[str, Any]


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    email: str
    created_at: datetime
    profile: UserProfileRead


class RegisterRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: EmailStr
    password: str = Field(min_length=10)

    @field_validator("email")
    @classmethod
    def _normalize_email(cls, value: str) -> str:
        return value.strip().lower()


class LoginRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: EmailStr
    password: str = Field(min_length=1)

    @field_validator("email")
    @classmethod
    def _normalize_email(cls, value: str) -> str:
        return value.strip().lower()


class ProfileUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    display_name: str | None = Field(default=None, max_length=120)
    timezone: str | None = Field(default=None, max_length=64)
    preferences: dict[str, Any] | None = None


class AuthResponse(BaseModel):
    user: UserRead
    access: str


class RefreshResponse(BaseModel):
    access: str
