"""
AX-22 — the public home-page drafter and its signed-in handoff (doc 20).

    GET  /guide/status            public: is drafting available, how many free drafts are left today
    POST /guide/draft-decision    public: describe a decision -> a scaffold (nothing is saved)
    POST /decisions/from-scaffold signed in: save a home-page draft as a real decision

The public routes never read or write decision data, never touch the signed-in AI quota, and store
nothing but anonymous counters (see app/ai/public_guard.py).
"""

from typing import Annotated

from fastapi import APIRouter, Depends, Request, status
from redis.exceptions import RedisError

from app.ai import public_drafter, public_guard
from app.ai.provider import ChatProvider, build_default_provider
from app.api.dependencies import CurrentUser, DbSession
from app.core.config import get_settings
from app.core.exceptions import ProviderUnavailableError, RateLimitedError
from app.observability import metrics
from app.schemas.decision import DecisionRead
from app.schemas.guide import DraftRequest, DraftResponse, FromScaffoldRequest, GuideStatus
from app.services import scaffold_service

router = APIRouter(tags=["guide"])


def get_guide_provider() -> ChatProvider | None:
    """The public lane's provider (overridable in tests). Off when the guide is switched off."""
    if not get_settings().guide_enabled:
        return None
    return build_default_provider()


GuideProviderDep = Annotated[ChatProvider | None, Depends(get_guide_provider)]


@router.get("/guide/status", response_model=GuideStatus)
async def guide_status(request: Request, provider: GuideProviderDep) -> GuideStatus:
    settings = get_settings()
    visitor = public_guard.visitor_key(public_guard.client_ip(request))
    used = await public_guard.drafts_used(visitor)
    return GuideStatus(
        enabled=provider is not None,
        free_drafts_per_day=settings.guide_free_drafts,
        drafts_remaining=max(settings.guide_free_drafts - used, 0),
    )


@router.post("/guide/draft-decision", response_model=DraftResponse)
async def draft_decision(
    payload: DraftRequest, request: Request, provider: GuideProviderDep
) -> DraftResponse:
    visitor = public_guard.visitor_key(public_guard.client_ip(request))
    wait = await public_guard.rate_limited(visitor)
    if wait is not None:
        metrics.record_guide_draft("rate_limited")
        raise RateLimitedError(
            "Lots of people are drafting right now. Please try again in a minute.",
            retry_after_seconds=wait,
        )
    outcome = await public_drafter.draft(payload.description, visitor=visitor, provider=provider)
    return DraftResponse(
        status=outcome.result,
        scaffold=outcome.scaffold,  # type: ignore[arg-type]
        draft_token=outcome.draft_token,
        drafts_remaining=outcome.drafts_remaining,
        message=outcome.message,
        from_cache=outcome.from_cache,
    )


@router.post(
    "/decisions/from-scaffold",
    response_model=DecisionRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_from_scaffold(
    payload: FromScaffoldRequest, current_user: CurrentUser, db: DbSession
) -> DecisionRead:
    try:
        decision = await scaffold_service.create_from_scaffold(
            db,
            owner_id=current_user.id,
            scaffold=payload.scaffold,
            draft_token=payload.draft_token,
        )
    except RedisError as exc:  # Redis down: we can't prove the draft is unused
        raise ProviderUnavailableError(
            "Saving drafts is briefly unavailable. Please try again."
        ) from exc
    return DecisionRead.model_validate(decision)
