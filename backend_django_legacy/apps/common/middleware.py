import uuid

REQUEST_ID_HEADER = "X-Request-ID"


class RequestIDMiddleware:
    """
    Attaches a correlation id to every request/response so it can appear in
    the error envelope (docs/05-api-specification.md §6) and in logs
    (docs/09-security-and-privacy.md §10), without ever containing private data.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        request_id = request.headers.get(REQUEST_ID_HEADER) or f"req_{uuid.uuid4().hex[:20]}"
        request.request_id = request_id
        response = self.get_response(request)
        response[REQUEST_ID_HEADER] = request_id
        return response
