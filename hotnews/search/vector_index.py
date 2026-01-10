# coding=utf-8
"""
向量索引模块

使用 FAISS 实现高效的语义搜索。
"""

import os
import pickle
from dataclasses import dataclass
from pathlib import Path
from typing import Any, List, Optional, Tuple

# numpy 作为可选依赖（Docker 镜像可能不会预装）
try:
    import numpy as np
    NUMPY_AVAILABLE = True
except ImportError:
    np = None
    NUMPY_AVAILABLE = False

from hotnews.core.logger import get_logger
from .config import get_search_config

logger = get_logger(__name__)

# 尝试导入可选依赖
try:
    from sentence_transformers import SentenceTransformer
    SENTENCE_TRANSFORMERS_AVAILABLE = True
except ImportError:
    SENTENCE_TRANSFORMERS_AVAILABLE = False
    logger.warning("sentence-transformers 未安装，向量搜索将不可用")

try:
    import faiss
    FAISS_AVAILABLE = True
except ImportError:
    FAISS_AVAILABLE = False
    logger.warning("faiss 未安装，向量搜索将不可用")

if not NUMPY_AVAILABLE:
    logger.warning("numpy 未安装，向量搜索将不可用")


@dataclass
class VectorSearchResult:
    """向量搜索结果"""

    title: str
    url: str
    platform_id: str
    date: str
    rank: int
    similarity: float  # 余弦相似度


class VectorIndex:
    """向量索引

    使用 FAISS 实现高效的高维向量检索。
    支持增量更新和近似最近邻搜索。
    """

    def __init__(
        self,
        index_dir: Optional[str] = None,
        embedding_model: Optional[str] = None,
        vector_size: int = 768,
    ):
        """
        初始化向量索引

        Args:
            index_dir: 索引存储目录
            embedding_model: Embedding 模型名称
            vector_size: 向量维度
        """
        if not FAISS_AVAILABLE or not SENTENCE_TRANSFORMERS_AVAILABLE or not NUMPY_AVAILABLE:
            logger.warning("向量索引依赖不可用，将使用模拟实现")
            self._available = False
            return

        self._available = True

        config = get_search_config()
        self.index_dir = Path(index_dir or config.index_dir)
        self.index_dir.mkdir(parents=True, exist_ok=True)

        self.embedding_model_name = embedding_model or config.embedding_model
        self.vector_size = vector_size

        # 索引文件路径
        self.index_path = self.index_dir / "vector_index.faiss"
        self.meta_path = self.index_dir / "vector_meta.pkl"
        self.model_path = self.index_dir / "model"

        # FAISS 索引
        self.faiss_index = None

        # 元数据 (id -> (title, url, platform_id, date))
        self.metadata: dict = {}

        # 加载或创建索引
        self._load_or_create_index()

        # 加载 embedding 模型
        self._load_model()

    def _load_model(self):
        """加载 embedding 模型"""
        if not self._available:
            return

        try:
            logger.info(f"加载 embedding 模型: {self.embedding_model_name}")
            self.model = SentenceTransformer(self.embedding_model_name)
            logger.info("Embedding 模型加载成功")
        except Exception as e:
            logger.error(f"加载 embedding 模型失败: {e}")
            self._available = False

    def _load_or_create_index(self):
        """加载或创建 FAISS 索引"""
        if not self._available:
            return

        # 尝试加载现有索引
        if self.index_path.exists() and self.meta_path.exists():
            try:
                # 加载 FAISS 索引
                self.faiss_index = faiss.read_index(str(self.index_path))

                # 加载元数据
                with open(self.meta_path, 'rb') as f:
                    self.metadata = pickle.load(f)

                logger.info(f"向量索引已加载: {self.faiss_index.ntotal} 条记录")
                return
            except Exception as e:
                logger.warning(f"加载现有索引失败: {e}，将创建新索引")

        # 创建新索引
        self._create_index()

    def _create_index(self):
        """创建新的 FAISS 索引"""
        if not self._available:
            return

        # 使用 HNSW 索引（快速近似最近邻）
        self.faiss_index = faiss.IndexHNSWFlat(
            self.vector_size,
            32,  # HNSW 参数
            faiss.METRIC_INNER_PRODUCT,
        )

        self.metadata = {}
        logger.info("新的向量索引已创建")

    def _ensure_available(self):
        """确保向量索引可用"""
        if not self._available:
            raise RuntimeError("向量索引依赖不可值。请安装: pip install numpy faiss-cpu sentence-transformers")

    def encode_texts(self, texts: List[str], batch_size: int = 32) -> Any:
        """
        将文本编码为向量

        Args:
            texts: 文本列表
            batch_size: 批量大小

        Returns:
            向量数组
        """
        self._ensure_available()

        embeddings = self.model.encode(
            texts,
            batch_size=batch_size,
            show_progress_bar=False,
            normalize_embeddings=True,  # L2 归一化，用于余弦相似度
        )

        return np.array(embeddings, dtype=np.float32)

    def build_from_data(self, data: List[Tuple[str, str, str, str, int]]):
        """
        从数据列表构建索引

        Args:
            data: [(title, url, platform_id, date, id), ...]
        """
        self._ensure_available()

        if not data:
            logger.warning("没有数据可索引")
            return

        logger.info(f"开始构建向量索引: {len(data)} 条数据")

        # 提取文本
        texts = [item[0] for item in data]

        # 批量编码
        batch_size = 32
        all_embeddings = []

        for i in range(0, len(texts), batch_size):
            batch = texts[i:i + batch_size]
            embeddings = self.encode_texts(batch)
            all_embeddings.append(embeddings)
            logger.debug(f"已编码 {min(i + batch_size, len(texts))}/{len(texts)} 条")

        # 合并所有嵌入
        embeddings = np.vstack(all_embeddings)

        # 重建索引
        self._create_index()
        self.faiss_index.add(embeddings)

        # 保存元数据
        self.metadata = {i: (data[i][0], data[i][1], data[i][2], data[i][3])
                        for i in range(len(data))}

        # 保存到磁盘
        self._save_index()

        logger.info(f"向量索引构建完成: {len(data)} 条记录")

    def incremental_update(self, data: List[Tuple[str, str, str, str, int]]):
        """
        增量更新索引

        Args:
            data: [(title, url, platform_id, date, id), ...]
        """
        self._ensure_available()

        if not data:
            return

        logger.debug(f"增量更新向量索引: {len(data)} 条")

        # 编码新数据
        texts = [item[0] for item in data]
        new_embeddings = self.encode_texts(texts)

        # 计算起始索引
        start_id = len(self.metadata)

        # 添加到索引
        self.faiss_index.add(new_embeddings)

        # 更新元数据
        for i, item in enumerate(data):
            self.metadata[start_id + i] = (item[0], item[1], item[2], item[3])

        # 保存到磁盘
        self._save_index()

    def _save_index(self):
        """保存索引到磁盘"""
        if not self._available or self.faiss_index is None:
            return

        faiss.write_index(self.faiss_index, str(self.index_path))

        with open(self.meta_path, 'wb') as f:
            pickle.dump(self.metadata, f)

        logger.debug("向量索引已保存")

    def search(
        self,
        query: str,
        limit: int = 50,
        similarity_threshold: float = 0.5,
        platform_filter: Optional[List[str]] = None,
        date_filter: Optional[Tuple[str, str]] = None,
    ) -> List[VectorSearchResult]:
        """
        语义搜索

        Args:
            query: 搜索查询
            limit: 返回结果数量
            similarity_threshold: 相似度阈值
            platform_filter: 平台过滤
            date_filter: 日期范围过滤

        Returns:
            VectorSearchResult 列表
        """
        self._ensure_available()

        if self.faiss_index is None or self.faiss_index.ntotal == 0:
            logger.warning("向量索引为空")
            return []

        # 编码查询
        query_embedding = self.encode_texts([query])

        # 搜索
        similarities, indices = self.faiss_index.search(query_embedding, limit * 2)  # 多取一些用于过滤

        results = []
        for rank, (idx, sim) in enumerate(zip(indices[0], similarities[0])):
            if idx < 0:  # 无效索引
                continue

            if sim < similarity_threshold:
                break

            if idx not in self.metadata:
                continue

            title, url, platform_id, date = self.metadata[idx]

            # 应用过滤
            if platform_filter and platform_id not in platform_filter:
                continue
            if date_filter and (date < date_filter[0] or date > date_filter[1]):
                continue

            results.append(VectorSearchResult(
                title=title,
                url=url or "",
                platform_id=platform_id,
                date=date,
                rank=len(results) + 1,
                similarity=float(sim),
            ))

            if len(results) >= limit:
                break

        logger.debug(f"向量搜索 '{query}': 找到 {len(results)} 条结果")
        return results

    def clear(self):
        """清空索引"""
        if self._available:
            self._create_index()
            self._save_index()
            logger.info("向量索引已清空")

    def get_stats(self) -> dict:
        """获取索引统计信息"""
        if not self._available or self.faiss_index is None:
            return {"available": False}

        return {
            "available": True,
            "total_items": self.faiss_index.ntotal,
            "embedding_model": self.embedding_model_name,
            "vector_size": self.vector_size,
            "index_size_mb": round(
                (self.index_path.stat().st_size if self.index_path.exists() else 0) / (1024 * 1024), 2
            ),
        }
