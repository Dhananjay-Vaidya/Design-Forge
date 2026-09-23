"""API-05/06/07 — GET /me, PATCH /me/profile, POST /me/delete."""

from fastapi import APIRouter, status

from app.api.dependencies import CurrentUser, DbSession
from app.schemas.user import ProfileUpdateRequest, UserRead
from app.services import auth_service

router = APIRouter(tags=["users"])


@router.get("/me", response_model=UserRead)
async def get_me(current_user: CurrentUser) -> UserRead:
    return UserRead.model_validate(current_user)


@router.patch("/me/profile", response_model=UserRead)
async def update_profile(
    payload: ProfileUpdateRequest, current_user: CurrentUser, db: DbSession
) -> UserRead:
    user = await auth_service.update_profile(
        db,
        current_user,
        display_name=payload.display_name,
        timezone=payload.timezone,
        preferences=payload.preferences,
    )
    return UserRead.model_validate(user)


@router.post("/me/delete", status_code=status.HTTP_204_NO_CONTENT)
async def delete_account(current_user: CurrentUser, db: DbSession) -> None:
    await auth_service.delete_account(db, current_user)
