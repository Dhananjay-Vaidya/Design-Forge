"""
Page-number pagination with the exact semantics the DRF backend had (the frontend and any other
client were written against them):

* `page` absent -> 1; not a positive integer, or beyond the last page -> 404 "Invalid page."
  (page 1 of an empty result set is valid).
* `page_size` absent, non-numeric, zero or negative -> 20; above 100 -> clamped to 100.
* Envelope: {count, page, page_size, results}.
"""

from typing import Any

from app.core.exceptions import NotFoundError

DEFAULT_PAGE_SIZE = 20
MAX_PAGE_SIZE = 100


def resolve_page_params(page: str | None, page_size: str | None) -> tuple[int, int]:
    number = 1
    if page is not None:
        try:
            number = int(page)
        except ValueError:
            raise NotFoundError("Invalid page.") from None
        if number < 1:
            raise NotFoundError("Invalid page.")
    size = DEFAULT_PAGE_SIZE
    if page_size is not None:
        try:
            parsed = int(page_size)
        except ValueError:
            parsed = 0
        if parsed > 0:
            size = min(parsed, MAX_PAGE_SIZE)
    return number, size


def ensure_page_exists(page: int, page_size: int, total: int) -> None:
    if page > 1 and (page - 1) * page_size >= total:
        raise NotFoundError("Invalid page.")


def envelope(results: list[Any], *, page: int, page_size: int, total: int) -> dict[str, Any]:
    return {"count": total, "page": page, "page_size": page_size, "results": results}


def paginate_list(items: list[Any], page: int, page_size: int) -> dict[str, Any]:
    ensure_page_exists(page, page_size, len(items))
    start = (page - 1) * page_size
    return envelope(
        items[start : start + page_size], page=page, page_size=page_size, total=len(items)
    )
