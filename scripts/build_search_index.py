# coding=utf-8
"""
搜索索引构建脚本

用于构建和更新全文/向量索引。

用法:
    python scripts/build_search_index.py           # 构建所有索引
    python scripts/build_search_index.py --force   # 强制重新构建
    python scripts/build_search_index.py --fts-only  # 仅构建 FTS5
"""

import argparse
import sys
from pathlib import Path

# 添加项目根目录到路径
sys.path.insert(0, str(Path(__file__).parent.parent))

from hotnews.search import get_search_manager, SearchConfig


def main():
    parser = argparse.ArgumentParser(description="搜索索引构建工具")
    parser.add_argument("--force", action="store_true", help="强制重新构建")
    parser.add_argument("--fts-only", action="store_true", help="仅构建 FTS5 索引")
    parser.add_argument("--stats", action="store_true", help="显示索引统计信息")
    args = parser.parse_args()

    config = SearchConfig()

    if args.stats:
        manager = get_search_manager()
        stats = manager.get_stats()
        print("=== 搜索索引统计 ===")
        print(f"FTS5 记录数: {stats['fts_items']:,}")
        print(f"向量索引记录数: {stats['vector_items']:,}")
        print(f"日期范围: {stats['date_range'][0]} ~ {stats['date_range'][1]}")
        print(f"FTS5 大小: {stats['fts_size_mb']:.2f} MB")
        print(f"向量索引大小: {stats['vector_size_mb']:.2f} MB")
        return

    # 构建索引
    manager = get_search_manager()

    if args.fts_only:
        # 仅构建 FTS5
        print("构建 FTS5 全文索引...")
        config.vector_enabled = False
        manager.config = config
        manager.build_all_indexes(force=args.force)
    else:
        # 构建所有索引
        print("构建所有搜索索引...")
        manager.build_all_indexes(force=args.force)

    # 显示统计
    stats = manager.get_stats()
    print(f"\n索引构建完成!")
    print(f"  - FTS5: {stats['fts_items']:,} 条记录 ({stats['fts_size_mb']:.2f} MB)")
    print(f"  - 向量: {stats['vector_items']:,} 条记录 ({stats['vector_size_mb']:.2f} MB)")
    print(f"  - 日期范围: {stats['date_range'][0]} ~ {stats['date_range'][1]}")


if __name__ == "__main__":
    main()
