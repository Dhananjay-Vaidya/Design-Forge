from django.urls import path

from . import views

urlpatterns = [
    path("decisions", views.DecisionListCreateView.as_view(), name="decision-list"),
    path(
        "decisions/<uuid:decision_id>", views.DecisionDetailView.as_view(), name="decision-detail"
    ),
    path(
        "decisions/<uuid:decision_id>/alternatives",
        views.AlternativeListCreateView.as_view(),
        name="alternative-list",
    ),
    path(
        "alternatives/<uuid:alternative_id>",
        views.AlternativeDetailView.as_view(),
        name="alternative-detail",
    ),
    path(
        "decisions/<uuid:decision_id>/criteria",
        views.CriterionListCreateView.as_view(),
        name="criterion-list",
    ),
    path(
        "criteria/<uuid:criterion_id>", views.CriterionDetailView.as_view(), name="criterion-detail"
    ),
    path("decisions/<uuid:decision_id>/scores", views.ScoresView.as_view(), name="decision-scores"),
    path(
        "decisions/<uuid:decision_id>/ranking", views.RankingView.as_view(), name="decision-ranking"
    ),
]
