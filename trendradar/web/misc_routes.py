import asyncio
import json
import os
from datetime import date

import requests
from fastapi import APIRouter
from fastapi.responses import JSONResponse, Response


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


@router.get("/api/nba-today")
async def api_nba_today():
    today = date.today().strftime("%Y-%m-%d")
    url = f"https://matchweb.sports.qq.com/kbs/list?columnId=100000&startTime={today}&endTime={today}"

    def _fetch():
        resp = requests.get(
            url,
            headers={
                "Referer": "https://kbs.sports.qq.com/",
                "User-Agent": "Mozilla/5.0",
                "Accept": "application/json, text/plain, */*",
            },
            timeout=10,
        )
        resp.raise_for_status()
        return resp.json()

    try:
        payload = await asyncio.to_thread(_fetch)
    except Exception as e:
        return JSONResponse(content={"detail": f"Failed to fetch Tencent NBA data: {e}"}, status_code=502)

    from trendradar.kernel.providers.tencent_nba import _extract_tencent_nba_matches

    games = _extract_tencent_nba_matches(payload)
    return UnicodeJSONResponse(content={"date": today, "games": games})
