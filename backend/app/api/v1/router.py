from fastapi import APIRouter

from app.api.v1.endpoints import alternatives, auth, criteria, decisions, rankings, scores, users

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(users.router)
api_router.include_router(decisions.router)
api_router.include_router(alternatives.router)
api_router.include_router(criteria.router)
api_router.include_router(scores.router)
api_router.include_router(rankings.router)
