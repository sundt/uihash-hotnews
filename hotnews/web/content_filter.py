"""
内容过滤服务

基于关键词黑名单过滤不感兴趣的新闻内容。
支持三种过滤模式：strict（严格）、moderate（适中）、off（关闭）
"""

import os
import re
from pathlib import Path
from typing import Dict, List, Optional, Set, Tuple


class ContentFilter:
    """内容过滤器"""

    def __init__(self, project_root: Optional[str] = None, config: Optional[Dict] = None):
        """
        初始化内容过滤器

        Args:
            project_root: 项目根目录
            config: 过滤配置，包含 filter_mode, blacklist 等
        """
        if project_root:
            self.project_root = Path(project_root)
        else:
            self.project_root = Path(__file__).parent.parent.parent

        self.config = config or {}
        self.filter_mode = self.config.get("filter_mode", "moderate")
        self.blacklist_enabled = self.config.get("blacklist", {}).get("enabled", True)
        self.keywords_file = self.config.get("blacklist", {}).get(
            "keywords_file", "config/filter_blacklist.txt"
        )

        # 加载黑名单关键词
        self.blacklist_keywords: Set[str] = set()
        self._load_blacklist()

        # 过滤统计
        self.stats = {
            "total_processed": 0,
            "total_filtered": 0,
            "keyword_hits": {},  # 每个关键词命中次数
        }

    def _load_blacklist(self) -> None:
        """从文件加载黑名单关键词"""
        if not self.blacklist_enabled:
            return

        keywords_path = self.project_root / self.keywords_file
        if not keywords_path.exists():
            return

        try:
            with open(keywords_path, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    # 跳过空行和注释
                    if not line or line.startswith("#"):
                        continue
                    # 转为小写存储，实现不区分大小写匹配
                    self.blacklist_keywords.add(line.lower())
        except Exception as e:
            print(f"Warning: Failed to load blacklist from {keywords_path}: {e}")

    def reload_blacklist(self) -> int:
        """重新加载黑名单，返回加载的关键词数量"""
        self.blacklist_keywords.clear()
        self._load_blacklist()
        return len(self.blacklist_keywords)

    def _match_keywords(self, text: str) -> List[str]:
        """
        匹配文本中的黑名单关键词

        Args:
            text: 要检查的文本

        Returns:
            匹配到的关键词列表
        """
        if not text or not self.blacklist_keywords:
            return []

        text_lower = text.lower()
        matched = []

        for keyword in self.blacklist_keywords:
            if keyword in text_lower:
                matched.append(keyword)

        return matched

    def should_filter(self, title: str) -> Tuple[bool, List[str]]:
        """
        判断新闻标题是否应该被过滤

        Args:
            title: 新闻标题

        Returns:
            (是否过滤, 匹配到的关键词列表)
        """
        if self.filter_mode == "off" or not self.blacklist_enabled:
            return False, []

        matched_keywords = self._match_keywords(title)

        if not matched_keywords:
            return False, []

        # 根据过滤模式判断
        if self.filter_mode == "strict":
            # 严格模式：任意匹配即过滤
            return True, matched_keywords
        elif self.filter_mode == "moderate":
            # 适中模式：需要2个或以上关键词匹配
            return len(matched_keywords) >= 2, matched_keywords
        else:
            return False, []

    def filter_news(
        self, news_list: List[Dict], title_key: str = "title"
    ) -> Tuple[List[Dict], List[Dict], Dict]:
        """
        过滤新闻列表

        Args:
            news_list: 新闻列表
            title_key: 标题字段名

        Returns:
            (通过的新闻列表, 被过滤的新闻列表, 过滤统计)
        """
        if self.filter_mode == "off" or not self.blacklist_enabled:
            return news_list, [], {"filtered_count": 0, "mode": "off"}

        passed = []
        filtered = []
        keyword_hits = {}

        for news in news_list:
            title = news.get(title_key, "")
            should_filter, matched = self.should_filter(title)

            if should_filter:
                filtered.append({**news, "_matched_keywords": matched})
                # 统计关键词命中
                for kw in matched:
                    keyword_hits[kw] = keyword_hits.get(kw, 0) + 1
            else:
                passed.append(news)

        # 更新全局统计
        self.stats["total_processed"] += len(news_list)
        self.stats["total_filtered"] += len(filtered)
        for kw, count in keyword_hits.items():
            self.stats["keyword_hits"][kw] = self.stats["keyword_hits"].get(kw, 0) + count

        stats = {
            "total_count": len(news_list),
            "passed_count": len(passed),
            "filtered_count": len(filtered),
            "mode": self.filter_mode,
            "keyword_hits": keyword_hits,
        }

        return passed, filtered, stats

    def get_stats(self) -> Dict:
        """获取过滤统计信息"""
        return {
            **self.stats,
            "mode": self.filter_mode,
            "blacklist_enabled": self.blacklist_enabled,
            "keywords_count": len(self.blacklist_keywords),
        }

    def set_filter_mode(self, mode: str) -> bool:
        """
        设置过滤模式

        Args:
            mode: 过滤模式 (strict/moderate/off)

        Returns:
            是否设置成功
        """
        if mode in ("strict", "moderate", "off"):
            self.filter_mode = mode
            return True
        return False

    def add_keyword(self, keyword: str) -> bool:
        """添加黑名单关键词"""
        if keyword:
            self.blacklist_keywords.add(keyword.lower())
            return True
        return False

    def remove_keyword(self, keyword: str) -> bool:
        """移除黑名单关键词"""
        keyword_lower = keyword.lower()
        if keyword_lower in self.blacklist_keywords:
            self.blacklist_keywords.discard(keyword_lower)
            return True
        return False

    def get_keywords(self) -> List[str]:
        """获取所有黑名单关键词"""
        return sorted(self.blacklist_keywords)
