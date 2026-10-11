from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


class ContactRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")

    name: str = Field(min_length=1, max_length=80)
    email: EmailStr = Field(max_length=254)
    reason: Literal["general", "feedback", "partnership", "support", "press"] = "general"
    message: str = Field(min_length=1, max_length=2000)
    consent: Literal[True]
    website: str = Field(default="", max_length=200, description="Leave empty.")

    @field_validator("consent", mode="before")
    @classmethod
    def consent_is_explicit(cls, value):
        if value is not True:
            raise ValueError("Please agree to be contacted about this message.")
        return value


class ContactResponse(BaseModel):
    ok: Literal[True] = True
