from __future__ import annotations

import hashlib
import time
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Any, Dict, List

import requests

from trendradar.storage.base import NewsItem

from .base import ProviderFetchContext, ProviderFetchError, ProviderFetchResult


def _extract_tencent_nba_matches(payload: Any) -> List[Dict[str, Any]]:
    if payload is None:
        return []

    matches: List[Dict[str, Any]] = []
    seen = set()

    stack = [payload]
    while stack:
        cur = stack.pop()
        if isinstance(cur, dict):
            if "mid" in cur and ("leftName" in cur or "rightName" in cur):
                match_type = str(cur.get("matchType") or "").strip()
                competition_id = str(cur.get("competitionId") or "").strip()

                left_name = str(cur.get("leftName") or "").strip()
                right_name = str(cur.get("rightName") or "").strip()
                left_id = str(cur.get("leftId") or "").strip()
                right_id = str(cur.get("rightId") or "").strip()

                is_real_game = (
                    match_type in ("2", "02")
                    and competition_id == "100000"
                    and left_name
                    and right_name
                    and left_id
                    and right_id
                )

                if not is_real_game:
                    for v in cur.values():
                        if isinstance(v, (dict, list)):
                            stack.append(v)
                    continue

                mid = str(cur.get("mid") or "").strip()
                if mid and mid not in seen:
                    seen.add(mid)
                    left_goal = cur.get("leftGoal")
                    right_goal = cur.get("rightGoal")

                    is_live_raw = cur.get("isLive")
                    is_live = False
                    if isinstance(is_live_raw, bool):
                        is_live = is_live_raw
                    elif isinstance(is_live_raw, (int, float)):
                        is_live = int(is_live_raw) == 1
                    elif isinstance(is_live_raw, str):
                        is_live = is_live_raw.strip() in ("1", "true", "True")

                    matches.append(
                        {
                            "mid": mid,
                            "leftName": cur.get("leftName") or "",
                            "leftBadge": cur.get("leftBadge") or "",
                            "leftGoal": "" if left_goal is None else str(left_goal),
                            "rightName": cur.get("rightName") or "",
                            "rightBadge": cur.get("rightBadge") or "",
                            "rightGoal": "" if right_goal is None else str(right_goal),
                            "matchDesc": cur.get("matchDesc") or "",
                            "startTime": cur.get("startTime") or "",
                            "isLive": is_live,
                            "jumpUrl": (cur.get("webUrl") or "").strip() or f"https://kbs.sports.qq.com/m/#/match/{mid}/detail",
                        }
                    )

            for v in cur.values():
                if isinstance(v, (dict, list)):
                    stack.append(v)
        elif isinstance(cur, list):
            for v in cur:
                if isinstance(v, (dict, list)):
                    stack.append(v)

    return matches


def _parse_start_time(raw: str):
    s = (raw or "").strip()
    if not s:
        return None
    try:
        return datetime.strptime(s, "%Y-%m-%d %H:%M:%S")
    except Exception:
        return None


def _format_match_time_for_title(raw: str) -> str:
    dt = _parse_start_time(raw)
    if dt is None:
        return ""
    # Keep it compact but include day so the list is understandable.
    return dt.strftime("%m-%d %H:%M")


@dataclass(frozen=True)
class TencentNbaProvider:
    provider_id: str = "tencent_nba"

    def fetch(
        self,
        *,
        ctx: ProviderFetchContext,
        platform_id: str,
        platform_name: str,
        platform_config: Dict[str, Any],
    ) -> ProviderFetchResult:
        started_at = time.time()

        days = int(platform_config.get("days") or 7)
        max_items = int(platform_config.get("max_items") or 30)
        timeout_s = int(platform_config.get("timeout_s") or 10)

        end_day = date.today()
        start_day = end_day - timedelta(days=max(days, 1) - 1)
        start_str = start_day.strftime("%Y-%m-%d")
        end_str = end_day.strftime("%Y-%m-%d")

        url = f"https://matchweb.sports.qq.com/kbs/list?columnId=100000&startTime={start_str}&endTime={end_str}"

        try:
            resp = requests.get(
                url,
                headers={
                    "Referer": "https://kbs.sports.qq.com/",
                    "User-Agent": "Mozilla/5.0",
                    "Accept": "application/json, text/plain, */*",
                },
                timeout=timeout_s,
            )
            resp.raise_for_status()
            payload = resp.json()
        except Exception as e:
            raise ProviderFetchError(
                f"failed to fetch: {e}",
                platform_id=platform_id,
                provider=self.provider_id,
                cause=e,
            )

        matches = _extract_tencent_nba_matches(payload)

        items: List[NewsItem] = []
        if not matches:
            items.append(
                NewsItem(
                    title="今日暂无比赛",
                    source_id=platform_id,
                    source_name=platform_name,
                    rank=1,
                    url="",
                    mobile_url="",
                    crawl_time=ctx.now.strftime("%H:%M"),
                )
            )
        else:
            sorted_matches = sorted(
                matches,
                key=lambda m: _parse_start_time(m.get("startTime")) or datetime.min,
                reverse=True,
            )
            for idx, m in enumerate(sorted_matches[: max_items], start=1):
                left = (m.get("leftName") or "").strip()
                right = (m.get("rightName") or "").strip()
                lg = (m.get("leftGoal") or "-").strip()
                rg = (m.get("rightGoal") or "-").strip()
                desc = (m.get("matchDesc") or "").strip()
                mt = _format_match_time_for_title(m.get("startTime") or "")
                prefix = f"[{mt}] " if mt else ""
                title = f"{prefix}{left} vs {right}  {lg}:{rg}  {desc}".strip()
                jump_url = (m.get("jumpUrl") or "").strip()
                items.append(
                    NewsItem(
                        title=title,
                        source_id=platform_id,
                        source_name=platform_name,
                        rank=idx,
                        url=jump_url,
                        mobile_url="",
                        crawl_time=ctx.now.strftime("%H:%M"),
                    )
                )

        duration_ms = int((time.time() - started_at) * 1000)
        content_hash = hashlib.sha1("\n".join([it.title for it in items]).encode("utf-8")).hexdigest()

        metric = {
            "provider": self.provider_id,
            "platform_id": platform_id,
            "platform_name": platform_name,
            "status": "success",
            "duration_ms": duration_ms,
            "items_count": len(items),
            "error": "",
            "content_hash": content_hash,
        }

        return ProviderFetchResult(
            platform_id=platform_id,
            platform_name=platform_name,
            provider=self.provider_id,
            items=items,
            metric=metric,
        )
