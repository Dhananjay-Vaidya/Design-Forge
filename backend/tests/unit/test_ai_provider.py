"""Provider error mapping and metric categorisation (no SDK network calls)."""

import pytest

from app.ai.provider import (
    AIProviderError,
    AIRateLimitError,
    AITimeoutError,
    AIUnavailableError,
    _map_api_error,
)
from app.observability.metrics import categorize_error


class _ApiError(Exception):
    def __init__(self, code: int) -> None:
        self.code = code


@pytest.mark.parametrize(
    "code,expected",
    [
        (429, AIRateLimitError),
        (500, AIUnavailableError),
        (503, AIUnavailableError),
        (404, AIUnavailableError),  # retired model id: the fallback model gets a chance
        (400, AIProviderError),
        (403, AIProviderError),
    ],
)
def test_api_errors_map_to_bounded_types(code, expected):
    mapped = _map_api_error(_ApiError(code))
    assert type(mapped) is expected


def test_error_types_land_in_the_right_metric_categories():
    assert categorize_error(AIRateLimitError()) == "rate_limit"
    assert categorize_error(AITimeoutError()) == "timeout"
    assert categorize_error(AIUnavailableError()) == "provider"
