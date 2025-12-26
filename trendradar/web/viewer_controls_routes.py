import json
from fastapi import APIRouter, Request
from fastapi.responses import Response


router = APIRouter()


class UnicodeJSONResponse(Response):
    media_type = "application/json"

    def render(self, content) -> bytes:
        return json.dumps(
            content,
            ensure_ascii=False,
            allow_nan=False,
            indent=None,
            separators=(",", ":"),
        ).encode("utf-8")


def _get_services(request: Request):
    fn = getattr(request.app.state, "get_services", None)
    if not callable(fn):
        raise RuntimeError("get_services not configured")
    return fn()


@router.get("/api/categories")
async def api_categories(request: Request):
    viewer_service, _ = _get_services(request)
    categories = viewer_service.get_category_list()
    return UnicodeJSONResponse(content=categories)


@router.get("/api/filter/stats")
async def api_filter_stats(request: Request):
    viewer_service, _ = _get_services(request)
    stats = viewer_service.get_filter_stats()
    return UnicodeJSONResponse(content=stats)


@router.post("/api/filter/mode")
async def api_set_filter_mode(request: Request, mode: str):
    viewer_service, _ = _get_services(request)
    success = viewer_service.set_filter_mode(mode)
    return UnicodeJSONResponse(content={"success": success, "mode": mode})


@router.get("/api/blacklist/keywords")
async def api_blacklist_keywords(request: Request):
    viewer_service, _ = _get_services(request)
    keywords = viewer_service.get_blacklist_keywords()
    return UnicodeJSONResponse(content={"keywords": keywords})


@router.post("/api/blacklist/reload")
async def api_reload_blacklist(request: Request):
    viewer_service, _ = _get_services(request)
    count = viewer_service.reload_blacklist()
    return UnicodeJSONResponse(content={"success": True, "keywords_count": count})
