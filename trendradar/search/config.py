# coding=utf-8
"""
搜索配置模块

管理搜索功能的各种配置参数。
"""

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Optional


@dataclass
class SearchConfig:
    """搜索配置类"""

    # 数据范围配置
    search_days: int = 30  # 搜索最近多少天的数据

    # 索引存储路径
    index_dir: str = "output/search_indexes"

    # FTS5 全文索引配置
    fts_tokenizer: str = "porter"  # tokenizer: porter, icu, unicode61

    # 向量搜索配置
    vector_enabled: bool = True  # 是否启用向量搜索
    embedding_model: str = "shibing624/text2vec-base-chinese"  # embedding 模型
    vector_top_k: int = 50  # 向量搜索返回数量
    vector_similarity_threshold: float = 0.5  # 相似度阈值

    # 混合搜索配置
    hybrid_rrf_k: float = 60.0  # RRF 融合参数
    hybrid_fusion_limit: int = 100  # 融合后返回数量

    # 搜索限制
    max_results: int = 500  # 最大返回结果数
    keyword_min_score: float = 0.3  # 关键词搜索最低得分

    # 性能配置
    batch_size: int = 1000  # 批量处理大小
    cache_ttl: int = 3600  # 缓存有效期（秒）

    @classmethod
    def from_env(cls) -> "SearchConfig":
        """从环境变量加载配置"""
        return cls(
            search_days=int(os.environ.get("TREND_RADAR_SEARCH_DAYS", cls.search_days)),
            index_dir=os.environ.get("TREND_RADAR_INDEX_DIR", cls.index_dir),
            vector_enabled=os.environ.get("TREND_RADAR_VECTOR_ENABLED", "1").lower() in ("1", "true", "yes"),
            embedding_model=os.environ.get("TREND_RADAR_EMBEDDING_MODEL", cls.embedding_model),
            vector_top_k=int(os.environ.get("TREND_RADAR_VECTOR_TOP_K", cls.vector_top_k)),
            max_results=int(os.environ.get("TREND_RADAR_MAX_RESULTS", cls.max_results)),
            batch_size=int(os.environ.get("TREND_RADAR_BATCH_SIZE", cls.batch_size)),
            cache_ttl=int(os.environ.get("TREND_RADAR_CACHE_TTL", cls.cache_ttl)),
        )

    @property
    def index_path(self) -> Path:
        """获取索引存储路径"""
        return Path(self.index_dir)

    def ensure_index_dir(self) -> Path:
        """确保索引目录存在"""
        self.index_path.mkdir(parents=True, exist_ok=True)
        return self.index_path


# 全局配置实例
_search_config: Optional[SearchConfig] = None


def get_search_config(force_reload: bool = False) -> SearchConfig:
    """获取搜索配置（单例模式）"""
    global _search_config
    if _search_config is None or force_reload:
        _search_config = SearchConfig.from_env()
    return _search_config


def reset_search_config() -> None:
    """重置配置（主要用于测试）"""
    global _search_config
    _search_config = None
