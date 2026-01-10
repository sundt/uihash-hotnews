# coding=utf-8
"""
混合搜索模块

融合关键词搜索和向量搜索的结果。
使用 Reciprocal Rank Fusion (RRF) 算法进行排序融合。
"""

import concurrent.futures
from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple

from hotnews.core.logger import get_logger
from .config import get_search_config
from .fts_index import FTSIndex, SearchResult as FTSResult
from .vector_index import VectorIndex, VectorSearchResult

logger = get_logger(__name__)


@dataclass
class HybridSearchResult:
    """混合搜索结果"""

    title: str
    url: str
    platform_id: str
    date: str
    rank: int
    fts_score: float  # FTS 排名分数
    vector_score: float  # 向量相似度
    combined_score: float  # 融合分数
    sources: List[str]  # 结果来源: ["fts", "vector"]


def rrf_fusion(
    fts_results: List[FTSResult],
    vector_results: List[VectorSearchResult],
    k: float = 60.0,
    limit: int = 100,
) -> List[HybridSearchResult]:
    """
    使用 RRF 算法融合搜索结果

    RRF (Reciprocal Rank Fusion) 是一种简单的排名融合算法：
    score = 1.0 / (k + rank)

    Args:
        fts_results: FTS 搜索结果
        vector_results: 向量搜索结果
        k: RRF 参数
        limit: 返回结果数量

    Returns:
        融合后的结果列表
    """
    # 使用 URL 作为唯一标识（合并重复结果）
    url_to_result: Dict[str, HybridSearchResult] = {}

    # 处理 FTS 结果
    for rank, result in enumerate(fts_results, 1):
        url = result.url or f"title:{result.title[:50]}"
        if url not in url_to_result:
            url_to_result[url] = HybridSearchResult(
                title=result.title,
                url=result.url or "",
                platform_id=result.platform_id,
                date=result.date,
                rank=0,
                fts_score=1.0 / (k + rank),
                vector_score=0.0,
                combined_score=1.0 / (k + rank),
                sources=["fts"],
            )
        else:
            # 已存在，累加 FTS 分数
            url_to_result[url].fts_score += 1.0 / (k + rank)
            url_to_result[url].combined_score += 1.0 / (k + rank)
            if "fts" not in url_to_result[url].sources:
                url_to_result[url].sources.append("fts")

    # 处理向量结果
    for rank, result in enumerate(vector_results, 1):
        url = result.url or f"title:{result.title[:50]}"
        rrf_score = 1.0 / (k + rank)

        if url not in url_to_result:
            url_to_result[url] = HybridSearchResult(
                title=result.title,
                url=result.url or "",
                platform_id=result.platform_id,
                date=result.date,
                rank=0,
                fts_score=0.0,
                vector_score=rrf_score,
                combined_score=rrf_score,
                sources=["vector"],
            )
        else:
            # 已存在，累加向量分数
            url_to_result[url].vector_score += rrf_score
            url_to_result[url].combined_score += rrf_score
            if "vector" not in url_to_result[url].sources:
                url_to_result[url].sources.append("vector")

    # 按融合分数排序
    sorted_results = sorted(
        url_to_result.values(),
        key=lambda x: x.combined_score,
        reverse=True,
    )[:limit]

    # 更新排名
    for rank, result in enumerate(sorted_results, 1):
        result.rank = rank

    return sorted_results


def hybrid_search(
    query: str,
    fts_index: FTSIndex,
    vector_index: Optional[VectorIndex],
    config=None,
    limit: int = 100,
    modes: Tuple[str, ...] = ("fts", "vector"),
) -> List[HybridSearchResult]:
    """
    混合搜索

    Args:
        query: 搜索查询
        fts_index: FTS 全文索引
        vector_index: 向量索引（可选）
        config: 搜索配置
        limit: 返回结果数量
        modes: 搜索模式 ("fts", "vector", "hybrid")

    Returns:
        HybridSearchResult 列表
    """
    if config is None:
        config = get_search_config()

    fts_limit = limit if "fts" in modes else 0
    vector_limit = limit if "vector" in modes else 0

    fts_results: List[FTSResult] = []
    vector_results: List[VectorSearchResult] = []

    # 并行执行搜索
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
        fts_future = None
        vector_future = None

        if "fts" in modes and fts_limit > 0:
            fts_future = executor.submit(
                fts_index.search,
                query,
                limit=fts_limit,
            )

        if "vector" in modes and vector_limit > 0 and vector_index is not None:
            vector_future = executor.submit(
                vector_index.search,
                query,
                limit=vector_limit,
                similarity_threshold=config.vector_similarity_threshold,
            )

        # 收集结果
        if fts_future:
            try:
                fts_results = fts_future.result()
            except Exception as e:
                logger.error(f"FTS 搜索失败: {e}")

        if vector_future:
            try:
                vector_results = vector_future.result()
            except Exception as e:
                logger.error(f"向量搜索失败: {e}")

    # 融合结果
    if "fts" in modes and "vector" in modes:
        results = rrf_fusion(
            fts_results,
            vector_results,
            k=config.hybrid_rrf_k,
            limit=config.hybrid_fusion_limit,
        )
    elif "fts" in modes:
        results = [
            HybridSearchResult(
                title=r.title,
                url=r.url,
                platform_id=r.platform_id,
                date=r.date,
                rank=i + 1,
                fts_score=1.0,
                vector_score=0.0,
                combined_score=1.0,
                sources=["fts"],
            )
            for i, r in enumerate(fts_results[:limit])
        ]
    elif "vector" in modes and vector_results:
        results = [
            HybridSearchResult(
                title=r.title,
                url=r.url,
                platform_id=r.platform_id,
                date=r.date,
                rank=i + 1,
                fts_score=0.0,
                vector_score=r.similarity,
                combined_score=r.similarity,
                sources=["vector"],
            )
            for i, r in enumerate(vector_results[:limit])
        ]
    else:
        results = []

    logger.info(f"混合搜索 '{query}': "
                f"FTS={len(fts_results)}, Vector={len(vector_results)}, "
                f"融合后={len(results)}")

    return results


def unified_search(
    query: str,
    fts_index: FTSIndex,
    vector_index: Optional[VectorIndex],
    search_mode: str = "hybrid",
    limit: int = 100,
    platform_filter: Optional[List[str]] = None,
    date_filter: Optional[Tuple[str, str]] = None,
) -> List[HybridSearchResult]:
    """
    统一搜索接口

    Args:
        query: 搜索查询
        fts_index: FTS 全文索引
        vector_index: 向量索引
        search_mode: 搜索模式 ("keyword", "fuzzy", "semantic", "hybrid")
        limit: 返回结果数量
        platform_filter: 平台过滤
        date_filter: 日期范围过滤

    Returns:
        HybridSearchResult 列表
    """
    config = get_search_config()

    # 根据搜索模式选择执行哪些搜索
    if search_mode == "keyword":
        modes = ("fts",)
    elif search_mode == "semantic":
        modes = ("vector",)
    elif search_mode == "hybrid":
        modes = ("fts", "vector")
    else:
        # 默认 hybrid
        modes = ("fts", "vector")

    # 执行混合搜索
    results = hybrid_search(
        query=query,
        fts_index=fts_index,
        vector_index=vector_index,
        config=config,
        limit=limit,
        modes=modes,
    )

    # 应用过滤
    if platform_filter or date_filter:
        filtered = []
        for r in results:
            if platform_filter and r.platform_id not in platform_filter:
                continue
            if date_filter and (r.date < date_filter[0] or r.date > date_filter[1]):
                continue
            filtered.append(r)
        results = filtered

    return results
