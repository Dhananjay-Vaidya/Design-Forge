"""Public contact intake. No outbound sends and no logging of request content."""

from fastapi import APIRouter, Request
from fastapi.exceptions import RequestValidationError
from fastapi.routing import APIRoute
from redis.exceptions import RedisError
from sqlalchemy.exc import SQLAlchemyError

from app.api.dependencies import DbSession
from app.core.exceptions import DatabaseError, RateLimitedError, ValidationAppError
from app.models.contact import ContactMessage
from app.observability.metrics import CONTACT_SUBMISSIONS
from app.schemas.contact import ContactRequest, ContactResponse
from app.services import contact_guard


class ContactRoute(APIRoute):
    def get_route_handler(self):
        original = super().get_route_handler()

        async def protected(request: Request):
            visitor = contact_guard.ip_hash(request)
            try:
                wait = await contact_guard.rate_limited(visitor)
            except RedisError:
                CONTACT_SUBMISSIONS.labels(result="rate_limited").inc()
                # Never expose request contents or let a Redis outage remove abuse protection.
                raise RateLimitedError(
                    "The contact form is briefly unavailable. Please try again in a minute.",
                    retry_after_seconds=60,
                ) from None
            if wait is not None:
                CONTACT_SUBMISSIONS.labels(result="rate_limited").inc()
                raise RateLimitedError(
                    "Too many messages. Please wait a minute before trying again.",
                    retry_after_seconds=wait,
                )
            request.state.contact_ip_hash = visitor
            # Cap bytes before JSON parsing, including chunked requests without Content-Length.
            body = bytearray()
            async for chunk in request.stream():
                if len(body) + len(chunk) > 16_384:
                    CONTACT_SUBMISSIONS.labels(result="invalid").inc()
                    raise ValidationAppError(
                        "The message is too large.",
                        fields={"message": ["Keep it under 2000 characters."]},
                    )
                body.extend(chunk)
            request._body = bytes(body)
            try:
                return await original(request)
            except RequestValidationError:
                CONTACT_SUBMISSIONS.labels(result="invalid").inc()
                raise

        return protected


router = APIRouter(tags=["contact"], route_class=ContactRoute)


@router.post("/contact", response_model=ContactResponse)
async def submit_contact(
    payload: ContactRequest, request: Request, db: DbSession
) -> ContactResponse:
    if payload.website:
        CONTACT_SUBMISSIONS.labels(result="spam").inc()
        return ContactResponse()
    row = ContactMessage(
        **payload.model_dump(exclude={"website"}), ip_hash=request.state.contact_ip_hash
    )
    try:
        db.add(row)
        await db.commit()
    except SQLAlchemyError:
        await db.rollback()
        # SQLAlchemy exception text can contain SQL parameters, including contact PII.
        raise DatabaseError("That didn't send. Please try again.") from None
    CONTACT_SUBMISSIONS.labels(result="ok").inc()
    return ContactResponse()
