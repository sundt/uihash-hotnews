import asyncio
import json
import logging
import os
import random
import time
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from threading import Lock
from typing import Any, Dict, List, Optional
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

import requests

from trendradar.web.db_online import get_online_db_conn
from trendradar.web.rss_proxy import rss_proxy_fetch_warmup


_project_root = None

logger = logging.getLogger("uvicorn.error")

_rss_warmup_queue: Optional[asyncio.PriorityQueue] = None
_rss_warmup_worker_task: Optional[asyncio.Task] = None
_rss_warmup_producer_task: Optional[asyncio.Task] = None
_rss_warmup_running: bool = False
_rss_warmup_global_sem: Optional[asyncio.Semaphore] = None
_rss_warmup_inflight_lock = Lock()
_rss_warmup_inflight: set = set()
_rss_warmup_budget_lock = Lock()
_rss_warmup_budget_window_start: float = 0.0
_rss_warmup_budget_count: int = 0

_rss_entries_stats_last_log_at: float = 0.0


_mb_ai_task: Optional[asyncio.Task] = None
_mb_ai_running: bool = False
_mb_ai_global_sem: Optional[asyncio.Semaphore] = None
_mb_ai_budget_lock = Lock()
_mb_ai_budget_window_start: float = 0.0
_mb_ai_budget_count: int = 0


_MB_AI_PROMPT_VERSION = "mb_llm_filter_v2_enhanced"  # Updated: added few-shot examples, Chinese support, detailed category definitions
_MB_AI_ALLOWED_CATEGORIES = {"AI_MODEL", "DEV_INFRA", "HARDWARE_PRO"}
_MB_AI_SCORE_MIN = 75
_MB_AI_CONFIDENCE_MIN = 0.70


def _now_ts() -> int:
    return int(time.time())


def _get_online_db_conn():
    return get_online_db_conn(_project_root)


def _mb_ai_enabled() -> bool:
    try:
        enabled = (os.environ.get("TREND_RADAR_MB_AI_ENABLED") or "0").strip().lower() in {"1", "true", "yes"}
        if not enabled:
            return False
        key = (os.environ.get("DASHSCOPE_API_KEY") or "").strip()
        return bool(key)
    except Exception:
        return False


def _mb_ai_budget_allow() -> bool:
    max_per_hour = 200
    try:
        max_per_hour = int(os.environ.get("TREND_RADAR_MB_AI_MAX_PER_HOUR", "200"))
    except Exception:
        max_per_hour = 200

    now = time.time()
    with _mb_ai_budget_lock:
        global _mb_ai_budget_window_start, _mb_ai_budget_count
        if _mb_ai_budget_window_start <= 0 or now - _mb_ai_budget_window_start >= 3600:
            _mb_ai_budget_window_start = now
            _mb_ai_budget_count = 0
        if _mb_ai_budget_count >= max_per_hour:
            return False
        _mb_ai_budget_count += 1
        return True


def _mb_ai_extract_domain(url: str) -> str:
    u = (url or "").strip()
    if not u:
        return "-"
    try:
        return (urlparse(u).hostname or "").strip().lower() or "-"
    except Exception:
        return "-"


def _mb_ai_prompt_text() -> str:
    return (
        "You are a Senior Technical Editor for a high-quality developer news aggregator serving Chinese and English developers.\n\n"
        "Goal:\n"
        "Classify RSS content and decide whether it should be INCLUDED in a 'Hardcore Tech / Engineering' feed.\n"
        "Be conservative and precise. When uncertain, EXCLUDE.\n\n"
        "Input:\n"
        "A JSON array of items: [{\"id\":...,\"source\":...,\"domain\":...,\"title\":...}]\n"
        "- Titles may be in Chinese, English, or mixed languages\n"
        "- Domain indicates the source website\n\n"
        "Output (STRICT):\n"
        "- Output ONLY a valid JSON array (top-level array).\n"
        "- NO markdown, NO code fences, NO explanations, NO comments.\n"
        "- Output MUST contain exactly one object per input item, in the same order.\n"
        "- Do not add or remove items. Do not change ids.\n\n"
        "Schema for each output item:\n"
        "{\"id\":\"...\",\"category\":\"AI_MODEL|DEV_INFRA|HARDWARE_PRO|CONSUMER|BUSINESS|MARKETING|OTHER\",\"action\":\"include|exclude\",\"score\":0,\"confidence\":0.0,\"reason\":\"...\"}\n\n"
        "Category Definitions:\n"
        "- AI_MODEL: AI模型发布、算法研究、模型架构、训练技术、推理优化\n"
        "- DEV_INFRA: 开发工具、编程语言、框架库、CI/CD、云原生、数据库、中间件\n"
        "- HARDWARE_PRO: 芯片架构、GPU/TPU、服务器硬件、网络设备、存储技术\n"
        "- CONSUMER: 消费电子产品、智能硬件、手机平板、智能家居（非技术深度）\n"
        "- BUSINESS: 融资新闻、公司动态、市场分析、商业策略（非技术内容）\n"
        "- MARKETING: 营销活动、产品发布会、品牌推广、用户增长（非技术）\n"
        "- OTHER: 不属于以上任何分类的内容\n\n"
        "Mandatory decision rules:\n"
        "1) CATEGORY: Choose the MAIN focus. Mixed cases: if >60% technical depth → technical category; otherwise → business category.\n"
        "2) ACTION:\n"
        "   - include: ONLY if category is AI_MODEL/DEV_INFRA/HARDWARE_PRO AND has substantial technical depth\n"
        "   - exclude: all other cases (CONSUMER/BUSINESS/MARKETING/OTHER, or shallow technical content)\n"
        "3) SCORE (0-100): Engineering value for developers\n"
        "   - 90-100: Breakthrough technology, major framework release, critical security advisory\n"
        "   - 75-89: Important updates, useful tools, insightful technical articles\n"
        "   - 50-74: Regular updates, minor improvements, general tech news\n"
        "   - <50: Low technical value or non-technical content\n"
        "4) CONFIDENCE (0.0-1.0): Your certainty in classification\n"
        "   - ≥0.90: Very clear technical/business content\n"
        "   - 0.70-0.89: Clear but some ambiguity\n"
        "   - <0.70: Uncertain → MUST choose action='exclude'\n"
        "5) REASON: One sentence explanation, in the same language as title (Chinese if title is Chinese, English if English)\n\n"
        "Examples (Few-shot):\n"
        "1. {\"id\":\"x\",\"title\":\"OpenAI发布GPT-5模型，性能提升300%\"} → {\"category\":\"AI_MODEL\",\"action\":\"include\",\"score\":95,\"confidence\":0.95,\"reason\":\"重大AI模型发布\"}\n"
        "2. {\"id\":\"x\",\"title\":\"Kubernetes 1.30 released with enhanced security\"} → {\"category\":\"DEV_INFRA\",\"action\":\"include\",\"score\":82,\"confidence\":0.88,\"reason\":\"Important infrastructure update\"}\n"
        "3. {\"id\":\"x\",\"title\":\"某AI公司完成B轮融资5亿美元\"} → {\"category\":\"BUSINESS\",\"action\":\"exclude\",\"score\":30,\"confidence\":0.92,\"reason\":\"融资新闻，无技术深度\"}\n"
        "4. {\"id\":\"x\",\"title\":\"新款iPhone 16发布，售价$999\"} → {\"category\":\"CONSUMER\",\"action\":\"exclude\",\"score\":25,\"confidence\":0.95,\"reason\":\"消费电子产品发布\"}\n"
        "5. {\"id\":\"x\",\"title\":\"2024年AI行业趋势报告\"} → {\"category\":\"MARKETING\",\"action\":\"exclude\",\"score\":35,\"confidence\":0.75,\"reason\":\"市场分析报告\"}\n\n"
        "Calibration:\n"
        "Final filter: action='include' AND score≥75 AND confidence≥0.70 AND category∈{AI_MODEL,DEV_INFRA,HARDWARE_PRO}\n"
        "Therefore:\n"
        "- If confidence < 0.70: MUST choose action='exclude'\n"
        "- If score < 75: Content won't pass final filter\n"
        "- Scores ≥90 should be rare (only truly significant technical breakthroughs)\n"
        "- Be strict: when in doubt, exclude rather than include\n"
    )


def _mb_ai_call_qwen(items: List[Dict[str, str]]) -> List[Dict[str, Any]]:
    """Call DashScope(Qwen) OpenAI-compatible chat/completions endpoint.

    Returns a list of outputs (same length/order), or raises.
    """
    api_key = (os.environ.get("DASHSCOPE_API_KEY") or "").strip()
    if not api_key:
        raise RuntimeError("Missing DASHSCOPE_API_KEY")

    model = (os.environ.get("TREND_RADAR_MB_AI_MODEL") or "qwen-plus").strip() or "qwen-plus"
    endpoint = (os.environ.get("TREND_RADAR_MB_AI_ENDPOINT") or "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions").strip()

    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": _mb_ai_prompt_text()},
            {"role": "user", "content": json.dumps(items, ensure_ascii=False)},
        ],
        "temperature": 0,
    }
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    timeout_s = 30
    try:
        timeout_s = int(os.environ.get("TREND_RADAR_MB_AI_TIMEOUT_S", "30"))
    except Exception:
        timeout_s = 30

    resp = requests.post(endpoint, headers=headers, json=payload, timeout=timeout_s)
    if resp.status_code < 200 or resp.status_code >= 300:
        raise RuntimeError(f"qwen_http_{resp.status_code}: {resp.text[:500]}")
    data = resp.json() if resp.content else {}
    try:
        content = (
            (data.get("choices") or [])[0]
            .get("message", {})
            .get("content", "")
        )
    except Exception:
        content = ""
    if not isinstance(content, str) or not content.strip():
        raise RuntimeError("qwen_empty_content")

    parsed = json.loads(content)
    if not isinstance(parsed, list):
        raise RuntimeError("qwen_invalid_json_not_array")
    if len(parsed) != len(items):
        raise RuntimeError(f"qwen_invalid_len expected={len(items)} got={len(parsed)}")
    return parsed


def _mb_ai_normalize_row(out: Any) -> Dict[str, Any]:
    if not isinstance(out, dict):
        return {
            "category": "OTHER",
            "action": "exclude",
            "score": 0,
            "confidence": 0.0,
            "reason": "",
            "error": "invalid_output",
        }
    category = str(out.get("category") or "OTHER").strip() or "OTHER"
    action = str(out.get("action") or "exclude").strip().lower() or "exclude"
    if action not in {"include", "exclude"}:
        action = "exclude"
    score = 0
    try:
        score = int(float(out.get("score") or 0))
    except Exception:
        score = 0
    score = max(0, min(100, score))
    confidence = 0.0
    try:
        confidence = float(out.get("confidence") or 0.0)
    except Exception:
        confidence = 0.0
    confidence = max(0.0, min(1.0, confidence))
    reason = str(out.get("reason") or "")
    return {
        "category": category,
        "action": action,
        "score": score,
        "confidence": confidence,
        "reason": reason,
        "error": "",
    }


def _mb_ai_select_unlabeled(conn, limit: int) -> List[Dict[str, Any]]:
    lim = int(limit or 20)
    lim = max(1, min(100, lim))
    cur = conn.execute(
        """
        SELECT e.source_id, e.dedup_key, e.url, e.title
        FROM rss_entries e
        LEFT JOIN rss_entry_ai_labels l
          ON l.source_id = e.source_id AND l.dedup_key = e.dedup_key
        WHERE l.id IS NULL
        ORDER BY e.published_at DESC, e.id DESC
        LIMIT ?
        """,
        (lim,),
    )
    rows = cur.fetchall() or []
    out: List[Dict[str, Any]] = []
    for r in rows:
        sid = str(r[0] or "").strip()
        dk = str(r[1] or "").strip()
        url = str(r[2] or "").strip()
        title = str(r[3] or "")
        if not sid or not dk or not url:
            continue
        out.append({"source_id": sid, "dedup_key": dk, "url": url, "title": title})
    return out


def _mb_ai_pass_strict_s(row: Dict[str, Any]) -> bool:
    try:
        if str(row.get("action") or "").lower() != "include":
            return False
        if int(row.get("score") or 0) < _MB_AI_SCORE_MIN:
            return False
        if float(row.get("confidence") or 0.0) < _MB_AI_CONFIDENCE_MIN:
            return False
        if str(row.get("category") or "").strip() not in _MB_AI_ALLOWED_CATEGORIES:
            return False
        return True
    except Exception:
        return False


def _mb_ai_store_labels(conn, entries: List[Dict[str, Any]], outputs: List[Dict[str, Any]], *, provider: str, model: str, labeled_at: int) -> None:
    rows = []
    for ent, out in zip(entries, outputs):
        sid = str(ent.get("source_id") or "").strip()
        dk = str(ent.get("dedup_key") or "").strip()
        url = str(ent.get("url") or "").strip()
        title = str(ent.get("title") or "")
        domain = _mb_ai_extract_domain(url)
        norm = _mb_ai_normalize_row(out)

        # Enforce strict S inclusion semantics at storage time (extra guardrail)
        if norm.get("action") == "include" and not _mb_ai_pass_strict_s(norm):
            norm["action"] = "exclude"

        rows.append(
            (
                sid,
                dk[:500],
                url[:2000],
                domain[:255],
                title[:500],
                str(norm.get("category") or "OTHER")[:40],
                str(norm.get("action") or "exclude")[:10],
                int(norm.get("score") or 0),
                float(norm.get("confidence") or 0.0),
                str(norm.get("reason") or "")[:300],
                provider[:40],
                model[:80],
                _MB_AI_PROMPT_VERSION,
                int(labeled_at),
                str(norm.get("error") or "")[:500],
            )
        )

    if not rows:
        return
    conn.executemany(
        """
        INSERT OR IGNORE INTO rss_entry_ai_labels(
            source_id, dedup_key, url, domain, title,
            category, action, score, confidence, reason,
            provider, model, prompt_version, labeled_at, error
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        rows,
    )


async def _mb_ai_loop() -> None:
    global _mb_ai_running
    if not _mb_ai_enabled():
        return

    logger.info("mb_ai.start prompt_version=%s", _MB_AI_PROMPT_VERSION)
    while _mb_ai_running:
        try:
            if not _mb_ai_enabled():
                await asyncio.sleep(10)
                continue

            if not _mb_ai_budget_allow():
                await asyncio.sleep(10)
                continue

            batch_size = 20
            try:
                batch_size = int(os.environ.get("TREND_RADAR_MB_AI_BATCH_SIZE", "20"))
            except Exception:
                batch_size = 20
            batch_size = max(1, min(50, batch_size))

            conn = _get_online_db_conn()
            entries = _mb_ai_select_unlabeled(conn, batch_size)
            if not entries:
                await asyncio.sleep(5)
                continue

            items_for_llm = []
            for ent in entries:
                sid = str(ent.get("source_id") or "").strip()
                dk = str(ent.get("dedup_key") or "").strip()
                url = str(ent.get("url") or "").strip()
                title = str(ent.get("title") or "")
                domain = _mb_ai_extract_domain(url)
                items_for_llm.append(
                    {
                        "id": f"{sid}::{dk}",
                        "source": sid,
                        "domain": domain,
                        "title": title,
                    }
                )

            model = (os.environ.get("TREND_RADAR_MB_AI_MODEL") or "qwen-plus").strip() or "qwen-plus"
            provider = "dashscope"
            labeled_at = _now_ts()

            if _mb_ai_global_sem is None:
                outs = await asyncio.to_thread(_mb_ai_call_qwen, items_for_llm)
            else:
                async with _mb_ai_global_sem:
                    outs = await asyncio.to_thread(_mb_ai_call_qwen, items_for_llm)

            # Map results back to entries (order must match)
            normalized = []
            for out in outs:
                normalized.append(_mb_ai_normalize_row(out))

            try:
                _mb_ai_store_labels(conn, entries, normalized, provider=provider, model=model, labeled_at=labeled_at)
                conn.commit()
                logger.info("mb_ai.batch ok size=%s model=%s", len(entries), model)
            except Exception as e:
                try:
                    conn.rollback()
                except Exception:
                    pass
                logger.warning("mb_ai.store fail error=%s", str(e))

        except Exception as e:
            logger.warning("mb_ai.loop error=%s", str(e))

        await asyncio.sleep(1)

    logger.info("mb_ai.stop")


async def mb_ai_run_once(batch_size: int = 20, force: bool = False) -> Dict[str, Any]:
    """Run one AI labeling batch for Morning Brief. Intended for admin ops."""
    if not _mb_ai_enabled():
        return {"ok": False, "detail": "mb_ai_not_enabled"}

    if not force and not _mb_ai_budget_allow():
        return {"ok": False, "detail": "mb_ai_budget_exceeded"}

    bs = int(batch_size or 20)
    bs = max(1, min(50, bs))

    conn = _get_online_db_conn()
    entries = _mb_ai_select_unlabeled(conn, bs)
    if not entries:
        return {"ok": True, "attempted": 0, "labeled": 0, "detail": "no_unlabeled"}

    items_for_llm = []
    for ent in entries:
        sid = str(ent.get("source_id") or "").strip()
        dk = str(ent.get("dedup_key") or "").strip()
        url = str(ent.get("url") or "").strip()
        title = str(ent.get("title") or "")
        domain = _mb_ai_extract_domain(url)
        items_for_llm.append(
            {
                "id": f"{sid}::{dk}",
                "source": sid,
                "domain": domain,
                "title": title,
            }
        )

    model = (os.environ.get("TREND_RADAR_MB_AI_MODEL") or "qwen-plus").strip() or "qwen-plus"
    provider = "dashscope"
    labeled_at = _now_ts()

    try:
        if _mb_ai_global_sem is None:
            outs = await asyncio.to_thread(_mb_ai_call_qwen, items_for_llm)
        else:
            async with _mb_ai_global_sem:
                outs = await asyncio.to_thread(_mb_ai_call_qwen, items_for_llm)
        normalized = [_mb_ai_normalize_row(o) for o in outs]
        _mb_ai_store_labels(conn, entries, normalized, provider=provider, model=model, labeled_at=labeled_at)
        conn.commit()
        return {"ok": True, "attempted": len(entries), "labeled": len(entries), "model": model}
    except Exception as e:
        try:
            conn.rollback()
        except Exception:
            pass
        return {"ok": False, "attempted": len(entries), "error": str(e)[:500]}


def mb_ai_get_classification_stats(conn=None, last_n_hours: int = 24) -> Dict[str, Any]:
    """
    获取AI分类统计信息
    
    Args:
        conn: 数据库连接（可选，不提供则自动获取）
        last_n_hours: 统计最近N小时的数据
        
    Returns:
        统计信息字典
    """
    if conn is None:
        try:
            conn = _get_online_db_conn()
        except Exception as e:
            return {
                "error": f"无法连接数据库: {str(e)[:200]}",
                "time_range_hours": last_n_hours
            }
    
    cutoff_ts = _now_ts() - (last_n_hours * 3600)
    
    try:
        # 总体统计
        cur = conn.execute(
            "SELECT COUNT(*) FROM rss_entry_ai_labels WHERE labeled_at >= ?",
            (cutoff_ts,)
        )
        total_labeled = cur.fetchone()[0] or 0
        
        # 按action分组统计
        cur = conn.execute(
            """
            SELECT action, COUNT(*) as cnt
            FROM rss_entry_ai_labels
            WHERE labeled_at >= ?
            GROUP BY action
            """,
            (cutoff_ts,)
        )
        action_stats = {row[0]: row[1] for row in cur.fetchall()}
        
        # 按category分组统计
        cur = conn.execute(
            """
            SELECT category, COUNT(*) as cnt
            FROM rss_entry_ai_labels
            WHERE labeled_at >= ?
            GROUP BY category
            ORDER BY cnt DESC
            """,
            (cutoff_ts,)
        )
        category_stats = {row[0]: row[1] for row in cur.fetchall()}
        
        # include的平均分数和置信度
        cur = conn.execute(
            """
            SELECT 
                AVG(score) as avg_score,
                AVG(confidence) as avg_confidence,
                MIN(score) as min_score,
                MAX(score) as max_score,
                COUNT(*) as cnt
            FROM rss_entry_ai_labels
            WHERE labeled_at >= ? AND action = 'include'
            """,
            (cutoff_ts,)
        )
        row = cur.fetchone()
        include_stats = {
            "avg_score": round(row[0], 2) if row[0] else 0,
            "avg_confidence": round(row[1], 3) if row[1] else 0,
            "min_score": row[2] or 0,
            "max_score": row[3] or 0,
            "count": row[4] or 0
        }
        
        # 通过严格过滤的数量
        cur = conn.execute(
            """
            SELECT COUNT(*)
            FROM rss_entry_ai_labels
            WHERE labeled_at >= ?
              AND action = 'include'
              AND score >= ?
              AND confidence >= ?
              AND category IN ('AI_MODEL', 'DEV_INFRA', 'HARDWARE_PRO')
            """,
            (cutoff_ts, _MB_AI_SCORE_MIN, _MB_AI_CONFIDENCE_MIN)
        )
        passed_strict_filter = cur.fetchone()[0] or 0
        
        # 按模型统计
        cur = conn.execute(
            """
            SELECT model, COUNT(*) as cnt
            FROM rss_entry_ai_labels
            WHERE labeled_at >= ?
            GROUP BY model
            """,
            (cutoff_ts,)
        )
        model_stats = {row[0]: row[1] for row in cur.fetchall()}
        
        return {
            "time_range_hours": last_n_hours,
            "total_labeled": total_labeled,
            "action_stats": action_stats,
            "category_stats": category_stats,
            "include_stats": include_stats,
            "passed_strict_filter": passed_strict_filter,
            "pass_rate": round(passed_strict_filter / total_labeled * 100, 2) if total_labeled > 0 else 0,
            "model_stats": model_stats,
            "prompt_version": _MB_AI_PROMPT_VERSION,
            "filter_config": {
                "min_score": _MB_AI_SCORE_MIN,
                "min_confidence": _MB_AI_CONFIDENCE_MIN,
                "allowed_categories": list(_MB_AI_ALLOWED_CATEGORIES)
            }
        }
    except Exception as e:
        return {
            "error": str(e)[:500],
            "time_range_hours": last_n_hours
        }


async def mb_ai_test_classification(test_items: List[Dict[str, str]], force_model: str = None) -> Dict[str, Any]:
    """
    测试AI分类效果（用于prompt调试）
    
    Args:
        test_items: 测试数据 [{"id": "test1", "source": "test", "domain": "example.com", "title": "..."}]
        force_model: 强制使用特定模型（可选）
        
    Returns:
        分类结果
        
    Example:
        items = [
            {"id": "1", "source": "test", "domain": "github.com", "title": "Kubernetes 1.30 released"},
            {"id": "2", "source": "test", "domain": "techcrunch.com", "title": "某AI公司完成B轮融资"}
        ]
        result = await mb_ai_test_classification(items)
    """
    if not _mb_ai_enabled():
        return {"ok": False, "detail": "mb_ai_not_enabled"}
    
    if not test_items or not isinstance(test_items, list):
        return {"ok": False, "detail": "invalid_test_items"}
    
    model = force_model or (os.environ.get("TREND_RADAR_MB_AI_MODEL") or "qwen-plus").strip() or "qwen-plus"
    
    try:
        if _mb_ai_global_sem is None:
            outs = await asyncio.to_thread(_mb_ai_call_qwen, test_items)
        else:
            async with _mb_ai_global_sem:
                outs = await asyncio.to_thread(_mb_ai_call_qwen, test_items)
        
        normalized = [_mb_ai_normalize_row(o) for o in outs]
        
        # 添加是否通过严格过滤的标记
        for norm in normalized:
            norm["pass_strict_filter"] = _mb_ai_pass_strict_s(norm)
        
        return {
            "ok": True,
            "model": model,
            "prompt_version": _MB_AI_PROMPT_VERSION,
            "results": normalized,
            "raw_outputs": outs,
            "filter_config": {
                "min_score": _MB_AI_SCORE_MIN,
                "min_confidence": _MB_AI_CONFIDENCE_MIN,
                "allowed_categories": list(_MB_AI_ALLOWED_CATEGORIES)
            }
        }
    except Exception as e:
        return {"ok": False, "error": str(e)[:500], "model": model}


def _rss_entry_canonical_url(raw_url: str) -> str:
    u = (raw_url or "").strip()
    if not u:
        return ""
    try:
        parsed = urlparse(u)
    except Exception:
        return u

    scheme = (parsed.scheme or "").lower()
    netloc = (parsed.netloc or "").lower()
    path = parsed.path or ""

    try:
        q = []
        for k, v in parse_qsl(parsed.query or "", keep_blank_values=True):
            lk = (k or "").lower()
            if lk.startswith("utm_"):
                continue
            if lk in {"spm", "from", "src", "source", "ref", "referer", "share", "share_token"}:
                continue
            q.append((k, v))
        query = urlencode(q, doseq=True)
    except Exception:
        query = parsed.query or ""

    return urlunparse((scheme, netloc, path, "", query, ""))


def _rss_entry_dedup_key(entry: Any) -> str:
    if not isinstance(entry, dict):
        return ""
    guid = (entry.get("guid") or entry.get("id") or "").strip()
    if guid:
        return f"g:{guid}"
    link = (entry.get("link") or entry.get("url") or "").strip()
    canon = _rss_entry_canonical_url(link)
    if canon:
        return f"u:{canon}"
    if link:
        return f"l:{link}"
    title = (entry.get("title") or "").strip()
    if title:
        return f"t:{title}"
    return ""


def _rss_parse_published_ts(published_raw: str) -> int:
    s = (published_raw or "").strip()
    if not s:
        return 0

    # 1) Numeric timestamp (seconds)
    try:
        if s.isdigit():
            ts = int(s)
            if ts > 0:
                now = _now_ts()
                if ts > now + 7 * 24 * 60 * 60:
                    return 0
                return ts
    except Exception:
        pass

    # 2) ISO 8601 (Atom/JSONFeed common)
    try:
        iso = s
        if iso.endswith("Z"):
            iso = iso[:-1] + "+00:00"
        dt = datetime.fromisoformat(iso)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        ts = int(dt.timestamp())
        now = _now_ts()
        if ts > now + 7 * 24 * 60 * 60:
            return 0
        return ts
    except Exception:
        pass

    # 3) RFC822/1123 (RSS common)
    try:
        dt = parsedate_to_datetime(s)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        ts = int(dt.timestamp())
        now = _now_ts()
        if ts > now + 7 * 24 * 60 * 60:
            return 0
        return ts
    except Exception:
        pass

    return 0


def _maybe_log_rss_entries_stats(conn) -> None:
    global _rss_entries_stats_last_log_at
    now = time.time()
    if _rss_entries_stats_last_log_at > 0 and (now - _rss_entries_stats_last_log_at) < 60:
        return
    _rss_entries_stats_last_log_at = now

    try:
        cur = conn.execute("SELECT COUNT(*) FROM rss_entries")
        total = int((cur.fetchone() or [0])[0] or 0)
    except Exception:
        total = -1
    try:
        cur = conn.execute("SELECT COUNT(DISTINCT source_id) FROM rss_entries")
        sources = int((cur.fetchone() or [0])[0] or 0)
    except Exception:
        sources = -1
    try:
        day = datetime.now().strftime("%Y-%m-%d")
        start = int(datetime.strptime(day, "%Y-%m-%d").replace(tzinfo=timezone.utc).timestamp())
        end = start + 24 * 60 * 60
        cur = conn.execute(
            "SELECT COUNT(*) FROM rss_entries WHERE created_at >= ? AND created_at < ?",
            (start, end),
        )
        today_new = int((cur.fetchone() or [0])[0] or 0)
    except Exception:
        today_new = -1

    logger.info("rss_entries.stats total=%s sources=%s today_new=%s", total, sources, today_new)


def _rss_entries_retention_cleanup(conn, source_id: str, now_ts: int) -> None:
    sid = (source_id or "").strip()
    if not sid:
        return
    cutoff = int(now_ts) - 90 * 24 * 60 * 60
    try:
        conn.execute(
            "DELETE FROM rss_entries WHERE (published_at > 0 AND published_at < ?) OR created_at < ?",
            (cutoff, cutoff),
        )
    except Exception:
        pass
    try:
        conn.execute(
            """
            DELETE FROM rss_entries
            WHERE source_id = ?
              AND id NOT IN (
                SELECT id FROM rss_entries
                WHERE source_id = ?
                ORDER BY (CASE WHEN published_at > 0 THEN published_at ELSE created_at END) DESC, id DESC
                LIMIT 500
              )
            """,
            (sid, sid),
        )
    except Exception:
        pass


def rss_cadence_interval_s(cadence: str) -> int:
    c = (cadence or "").strip().upper()
    mapping = {
        "P0": 15 * 60,
        "P1": 30 * 60,
        "P2": 60 * 60,
        "P3": 2 * 60 * 60,
        "P4": 4 * 60 * 60,
        "P5": 8 * 60 * 60,
        "P6": 24 * 60 * 60,
    }
    return int(mapping.get(c, 4 * 60 * 60))


def rss_next_due_at(now_ts: int, cadence: str) -> int:
    base = rss_cadence_interval_s(cadence)
    jitter = random.uniform(0.85, 1.15)
    return int(now_ts + max(60, int(base * jitter)))


def rss_backoff_s(fail_count: int, error_reason: str) -> int:
    msg = (error_reason or "").lower()
    if "429" in msg or "rate limited" in msg:
        return 6 * 60 * 60
    if "403" in msg or "access denied" in msg or "captcha" in msg or "login" in msg:
        return 12 * 60 * 60
    step = max(0, int(fail_count) - 1)
    return int(min(24 * 60 * 60, 15 * 60 * (2**step)))


def rss_budget_allow(priority: int) -> bool:
    if priority <= 0:
        return True
    max_per_hour = 60
    try:
        max_per_hour = int(os.environ.get("TREND_RADAR_RSS_WARMUP_MAX_PER_HOUR", "60"))
    except Exception:
        max_per_hour = 60
    now = time.time()
    with _rss_warmup_budget_lock:
        global _rss_warmup_budget_window_start, _rss_warmup_budget_count
        if _rss_warmup_budget_window_start <= 0 or now - _rss_warmup_budget_window_start >= 3600:
            _rss_warmup_budget_window_start = now
            _rss_warmup_budget_count = 0
        if _rss_warmup_budget_count >= max_per_hour:
            return False
        _rss_warmup_budget_count += 1
        return True


async def rss_enqueue_warmup(source_id: str, priority: int = 10) -> Optional[asyncio.Future]:
    sid = (source_id or "").strip()
    if not sid:
        return None
    if _rss_warmup_queue is None:
        logger.info("rss_warmup.enqueue skip (queue_not_ready) source_id=%s", sid)
        return None
    if not rss_budget_allow(priority):
        logger.info("rss_warmup.enqueue skip (budget_denied) source_id=%s priority=%s", sid, priority)
        return None

    loop = asyncio.get_running_loop()
    fut: asyncio.Future = loop.create_future()
    with _rss_warmup_inflight_lock:
        if sid in _rss_warmup_inflight:
            fut.set_result({"queued": False, "source_id": sid, "reason": "already_inflight"})
            logger.info("rss_warmup.enqueue skip (already_inflight) source_id=%s priority=%s", sid, priority)
            return fut
        _rss_warmup_inflight.add(sid)
    await _rss_warmup_queue.put((int(priority), float(time.time()), sid, fut))
    logger.info("rss_warmup.enqueue ok source_id=%s priority=%s", sid, priority)
    return fut


async def _rss_process_warmup_one(source_id: str) -> Dict[str, Any]:
    sid = (source_id or "").strip()
    now = _now_ts()
    conn = _get_online_db_conn()
    cur = conn.execute(
        "SELECT id, url, enabled, cadence, etag, last_modified, fail_count, backoff_until FROM rss_sources WHERE id = ?",
        (sid,),
    )
    row = cur.fetchone()
    if not row:
        return {"ok": False, "source_id": sid, "error": "Source not found"}
    enabled = int(row[2] or 0)
    if enabled != 1:
        logger.info("rss_warmup.skip source_disabled source_id=%s", sid)
        return {"ok": False, "source_id": sid, "error": "Source disabled"}
    cadence = str(row[3] or "P4")
    if cadence.strip().upper() == "P7":
        logger.info("rss_warmup.skip cadence_disabled source_id=%s", sid)
        return {"ok": False, "source_id": sid, "error": "Cadence disabled"}
    backoff_until = int(row[7] or 0)
    if backoff_until > 0 and backoff_until > now:
        logger.info("rss_warmup.skip backoff source_id=%s backoff_until=%s", sid, backoff_until)
        return {"ok": False, "source_id": sid, "error": "Backoff", "backoff_until": backoff_until}
    url = (row[1] or "").strip()
    if not url:
        logger.info("rss_warmup.skip missing_url source_id=%s", sid)
        return {"ok": False, "source_id": sid, "error": "Missing url"}

    try:
        conn.execute(
            "UPDATE rss_sources SET last_attempt_at = ? WHERE id = ?",
            (now, sid),
        )
        conn.commit()
    except Exception:
        pass

    etag = str(row[4] or "")
    last_modified = str(row[5] or "")
    try:
        logger.info("rss_warmup.fetch start source_id=%s url=%s", sid, url)
        fetched = await asyncio.to_thread(rss_proxy_fetch_warmup, url, etag, last_modified)

        try:
            data = fetched.get("data") if isinstance(fetched, dict) else None
            entries = data.get("entries") if isinstance(data, dict) else None
            if isinstance(entries, list):
                created_at = now
                fetched_at = now
                rows_to_insert = []
                for ent in entries[:200]:
                    if not isinstance(ent, dict):
                        continue
                    title = (ent.get("title") or "").strip()
                    link = (ent.get("link") or "").strip()
                    published_raw = (ent.get("published") or "").strip()
                    if not title:
                        title = link
                    if not link:
                        continue
                    dk = _rss_entry_dedup_key(ent)
                    if not dk:
                        continue
                    published_at = _rss_parse_published_ts(published_raw)
                    rows_to_insert.append(
                        (sid, dk[:500], link[:2000], title[:500], int(published_at), published_raw[:500], int(fetched_at), int(created_at))
                    )
                if rows_to_insert:
                    conn.executemany(
                        "INSERT OR IGNORE INTO rss_entries(source_id, dedup_key, url, title, published_at, published_raw, fetched_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                        rows_to_insert,
                    )
                _rss_entries_retention_cleanup(conn, sid, now)
                conn.commit()
                logger.info(
                    "rss_warmup.fetch ok source_id=%s entries_in_feed=%s rows_attempted=%s",
                    sid,
                    len(entries),
                    len(rows_to_insert),
                )
                _maybe_log_rss_entries_stats(conn)
        except Exception:
            try:
                conn.rollback()
            except Exception:
                pass

        new_etag = (fetched.get("etag") or "").strip() if isinstance(fetched, dict) else ""
        new_lm = (fetched.get("last_modified") or "").strip() if isinstance(fetched, dict) else ""
        next_due = rss_next_due_at(now, cadence)
        conn.execute(
            "UPDATE rss_sources SET etag = ?, last_modified = ?, fail_count = 0, backoff_until = 0, last_error_reason = '', next_due_at = ? WHERE id = ?",
            (new_etag, new_lm, next_due, sid),
        )
        conn.commit()
        logger.info("rss_warmup.schedule next source_id=%s next_due_at=%s", sid, next_due)
        return {"ok": True, "source_id": sid, "next_due_at": next_due}
    except Exception as e:
        fail_count = int(row[6] or 0) + 1
        reason = str(e)
        backoff_sec = rss_backoff_s(fail_count, reason)
        until = now + int(backoff_sec)
        conn.execute(
            "UPDATE rss_sources SET fail_count = ?, backoff_until = ?, last_error_reason = ? WHERE id = ?",
            (fail_count, until, reason[:500], sid),
        )
        conn.commit()
        logger.warning(
            "rss_warmup.fetch fail source_id=%s fail_count=%s backoff_until=%s error=%s",
            sid,
            fail_count,
            until,
            reason,
        )
        return {"ok": False, "source_id": sid, "error": reason, "backoff_until": until}


async def _rss_warmup_worker_loop() -> None:
    global _rss_warmup_running
    if _rss_warmup_queue is None:
        return
    logger.info("rss_warmup.worker_loop start")
    while _rss_warmup_running:
        priority, _, sid, fut = await _rss_warmup_queue.get()
        try:
            logger.info("rss_warmup.worker start source_id=%s priority=%s", sid, priority)
            if _rss_warmup_global_sem is None:
                res = await _rss_process_warmup_one(sid)
            else:
                async with _rss_warmup_global_sem:
                    res = await _rss_process_warmup_one(sid)
            logger.info("rss_warmup.worker done source_id=%s ok=%s", sid, bool(res.get("ok")) if isinstance(res, dict) else False)
            try:
                if fut is not None and not fut.done():
                    fut.set_result(res)
            except Exception:
                pass
        finally:
            with _rss_warmup_inflight_lock:
                try:
                    _rss_warmup_inflight.discard(sid)
                except Exception:
                    pass
            try:
                _rss_warmup_queue.task_done()
            except Exception:
                pass


async def _rss_warmup_producer_loop() -> None:
    if _rss_warmup_queue is None:
        return
    logger.info("rss_warmup.producer_loop start")
    while _rss_warmup_running:
        try:
            now = _now_ts()
            conn = _get_online_db_conn()
            cur = conn.execute(
                "SELECT id FROM rss_sources WHERE enabled = 1 AND cadence != 'P7' AND (next_due_at = 0 OR next_due_at <= ?) AND (backoff_until = 0 OR backoff_until <= ?) ORDER BY next_due_at ASC LIMIT 10",
                (now, now),
            )
            rows = cur.fetchall() or []
            if rows:
                logger.info("rss_warmup.producer due_sources=%s", len(rows))
            for r in rows:
                sid = (r[0] or "").strip()
                if not sid:
                    continue
                await rss_enqueue_warmup(sid, priority=10)
        except Exception:
            pass
        await asyncio.sleep(20)


def rss_init_schedule_defaults(project_root) -> None:
    global _project_root
    _project_root = project_root
    conn = _get_online_db_conn()
    now = _now_ts()
    cur = conn.execute(
        "SELECT id, cadence, next_due_at FROM rss_sources WHERE enabled = 1 ORDER BY updated_at DESC"
    )
    rows = cur.fetchall() or []
    for r in rows:
        sid = (r[0] or "").strip()
        cadence = str(r[1] or "P4")
        next_due = int(r[2] or 0)
        if not sid:
            continue
        if next_due <= 0:
            nd = rss_next_due_at(now, cadence)
            try:
                conn.execute("UPDATE rss_sources SET next_due_at = ? WHERE id = ?", (nd, sid))
            except Exception:
                pass
    try:
        conn.commit()
    except Exception:
        pass


def rss_enforce_high_freq_cap(project_root) -> None:
    global _project_root
    _project_root = project_root
    cap = 25
    conn = _get_online_db_conn()
    cur = conn.execute(
        "SELECT id FROM rss_sources WHERE enabled = 1 AND (cadence = 'P0' OR cadence = 'P1') ORDER BY updated_at DESC"
    )
    rows = cur.fetchall() or []
    if len(rows) <= cap:
        return
    for r in rows[cap:]:
        sid = (r[0] or "").strip()
        if not sid:
            continue
        try:
            conn.execute("UPDATE rss_sources SET cadence = 'P2' WHERE id = ?", (sid,))
        except Exception:
            pass
    try:
        conn.commit()
    except Exception:
        pass


async def start(app, project_root) -> None:
    global _project_root
    global _rss_warmup_queue, _rss_warmup_worker_task, _rss_warmup_producer_task, _rss_warmup_running, _rss_warmup_global_sem
    global _mb_ai_task, _mb_ai_running, _mb_ai_global_sem

    _project_root = project_root

    app.state.rss_enqueue_warmup = rss_enqueue_warmup
    app.state.mb_ai_run_once = mb_ai_run_once

    enabled = (os.environ.get("TREND_RADAR_RSS_WARMUP_ENABLED") or "1").strip().lower() not in {
        "0",
        "false",
        "no",
    }
    if not enabled:
        logger.info("rss_warmup.disabled TREND_RADAR_RSS_WARMUP_ENABLED=%s", os.environ.get("TREND_RADAR_RSS_WARMUP_ENABLED"))
        return

    if _rss_warmup_queue is None:
        _rss_warmup_queue = asyncio.PriorityQueue()
    _rss_warmup_global_sem = asyncio.Semaphore(2)
    _rss_warmup_running = True

    logger.info("rss_warmup.start enabled=%s max_per_hour=%s", enabled, os.environ.get("TREND_RADAR_RSS_WARMUP_MAX_PER_HOUR", "60"))

    if _rss_warmup_worker_task is None or _rss_warmup_worker_task.done():
        _rss_warmup_worker_task = asyncio.create_task(_rss_warmup_worker_loop())
    if _rss_warmup_producer_task is None or _rss_warmup_producer_task.done():
        _rss_warmup_producer_task = asyncio.create_task(_rss_warmup_producer_loop())

    # Morning Brief AI labeler (DashScope/Qwen)
    if _mb_ai_enabled():
        if _mb_ai_global_sem is None:
            _mb_ai_global_sem = asyncio.Semaphore(1)
        _mb_ai_running = True
        if _mb_ai_task is None or _mb_ai_task.done():
            _mb_ai_task = asyncio.create_task(_mb_ai_loop())



async def stop() -> None:
    global _rss_warmup_running
    global _mb_ai_running

    _rss_warmup_running = False

    logger.info("rss_warmup.stop")

    try:
        if _rss_warmup_worker_task is not None:
            _rss_warmup_worker_task.cancel()
    except Exception:
        pass

    try:
        if _rss_warmup_producer_task is not None:
            _rss_warmup_producer_task.cancel()
    except Exception:
        pass

    _mb_ai_running = False
    try:
        if _mb_ai_task is not None:
            _mb_ai_task.cancel()
    except Exception:
        pass
