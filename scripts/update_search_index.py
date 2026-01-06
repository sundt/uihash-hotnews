# coding=utf-8
"""
增量索引更新脚本

用于定时更新搜索索引，只更新有变化的数据。

用法:
    python scripts/update_search_index.py           # 更新今天
    python scripts/update_search_index.py --date 2026-01-06  # 更新指定日期
    python scripts/update_search_index.py --all     # 更新所有有变化的日期

定时任务示例 (crontab):
    # 每天凌晨 2 点更新索引
    0 2 * * * cd /path/to/hotnews && python scripts/update_search_index.py
"""

import argparse
import sys
from datetime import datetime, timedelta
from pathlib import Path

# 添加项目根目录到路径
sys.path.insert(0, str(Path(__file__).parent.parent))

from trendradar.search import get_search_manager


def get_yesterday():
    """获取昨天的日期字符串"""
    return (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")


def main():
    parser = argparse.ArgumentParser(description="增量索引更新工具")
    parser.add_argument("--date", type=str, help="指定更新日期 (YYYY-MM-DD)")
    parser.add_argument("--all", action="store_true", help="更新所有有变化的日期")
    parser.add_argument("--stats", action="store_true", help="显示当前索引状态")
    args = parser.parse_args()

    manager = get_search_manager()

    if args.stats:
        stats = manager.get_stats()
        last_update = manager._last_update.strftime("%Y-%m-%d %H:%M:%S") if manager._last_update else "从未更新"
        print("=== 索引状态 ===")
        print(f"最后更新: {last_update}")
        print(f"FTS5 记录数: {stats['fts_items']:,}")
        print(f"日期范围: {stats['date_range'][0]} ~ {stats['date_range'][1]}")
        return

    if args.all:
        print("更新所有有变化的日期...")
        manager.incremental_update(date=None)
    elif args.date:
        print(f"更新日期: {args.date}")
        manager.incremental_update(date=args.date)
    else:
        # 默认更新昨天
        yesterday = get_yesterday()
        print(f"更新昨天数据: {yesterday}")
        manager.incremental_update(date=yesterday)


if __name__ == "__main__":
    main()
