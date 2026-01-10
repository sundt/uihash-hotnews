# coding=utf-8
"""
本地存储后端 - SQLite + TXT/HTML

使用 SQLite 作为主存储，支持可选的 TXT 快照和 HTML 报告
"""

import sqlite3
import os
import shutil
import pytz
import re
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Optional, Any

from hotnews.storage.base import StorageBackend, NewsItem, NewsData
from hotnews.utils.time import (
    get_configured_time,
    format_date_folder,
    format_time_filename,
)


class LocalStorageBackend(StorageBackend):
    """
    本地存储后端

    使用 SQLite 数据库存储新闻数据，支持：
    - 按日期组织的 SQLite 数据库文件
    - 可选的 TXT 快照（用于调试）
    - HTML 报告生成
    """

    def __init__(
        self,
        data_dir: str = "output",
        enable_txt: bool = True,
        enable_html: bool = True,
        timezone: str = "Asia/Shanghai",
    ):
        """
        初始化本地存储后端

        Args:
            data_dir: 数据目录路径
            enable_txt: 是否启用 TXT 快照
            enable_html: 是否启用 HTML 报告
            timezone: 时区配置（默认 Asia/Shanghai）
        """
        self.data_dir = Path(data_dir)
        self.enable_txt = enable_txt
        self.enable_html = enable_html
        self.timezone = timezone
        self._db_connections: Dict[str, sqlite3.Connection] = {}

    @property
    def backend_name(self) -> str:
        return "local"

    @property
    def supports_txt(self) -> bool:
        return self.enable_txt

    def _get_configured_time(self) -> datetime:
        """获取配置时区的当前时间"""
        return get_configured_time(self.timezone)

    def _format_date_folder(self, date: Optional[str] = None) -> str:
        """格式化日期文件夹名 (ISO 格式: YYYY-MM-DD)"""
        return format_date_folder(date, self.timezone)

    def _format_time_filename(self) -> str:
        """格式化时间文件名 (格式: HH-MM)"""
        return format_time_filename(self.timezone)

    def _get_db_path(self, date: Optional[str] = None) -> Path:
        """获取 SQLite 数据库路径"""
        date_folder = self._format_date_folder(date)
        db_dir = self.data_dir / date_folder
        db_dir.mkdir(parents=True, exist_ok=True)
        return db_dir / "news.db"

    def _get_connection(self, date: Optional[str] = None) -> sqlite3.Connection:
        """获取数据库连接（带缓存）"""
        db_path = str(self._get_db_path(date))

        if db_path not in self._db_connections:
            conn = sqlite3.connect(db_path)
            conn.row_factory = sqlite3.Row
            try:
                conn.execute("PRAGMA journal_mode=WAL;")
                conn.execute("PRAGMA synchronous=NORMAL;")
                conn.commit()
            except Exception:
                pass
            self._init_tables(conn)
            self._db_connections[db_path] = conn

        return self._db_connections[db_path]

    def _get_schema_path(self) -> Path:
        """获取 schema.sql 文件路径"""
        return Path(__file__).parent / "schema.sql"

    def _init_tables(self, conn: sqlite3.Connection) -> None:
        """从 schema.sql 初始化数据库表结构"""
        schema_path = self._get_schema_path()
        
        if schema_path.exists():
            with open(schema_path, "r", encoding="utf-8") as f:
                schema_sql = f.read()
            conn.executescript(schema_sql)
        else:
            raise FileNotFoundError(f"Schema file not found: {schema_path}")
        
        conn.commit()

    def _ensure_content_column(self, conn: sqlite3.Connection) -> None:
        """Ensure content column exists in news_items table"""
        try:
            cursor = conn.execute("PRAGMA table_info(news_items)")
            columns = {row[1] for row in cursor.fetchall()}
            if "content" not in columns:
                conn.execute("ALTER TABLE news_items ADD COLUMN content TEXT DEFAULT ''")
                conn.commit()
        except Exception as e:
            print(f"[本地存储] 检查/添加 content 列失败: {e}")

    def save_news_data(self, data: NewsData) -> bool:
        """
        保存新闻数据到 SQLite（以 URL 为唯一标识，支持标题更新检测）

        Args:
            data: 新闻数据

        Returns:
            是否保存成功
        """
        try:
            conn = self._get_connection(data.date)
            # Ensure content column exists
            self._ensure_content_column(conn)
            cursor = conn.cursor()

            # 获取配置时区的当前时间
            now_str = self._get_configured_time().strftime("%Y-%m-%d %H:%M:%S")

            # 首先同步平台信息到 platforms 表
            for source_id, source_name in data.id_to_name.items():
                cursor.execute("""
                    INSERT INTO platforms (id, name, updated_at)
                    VALUES (?, ?, ?)
                    ON CONFLICT(id) DO UPDATE SET
                        name = excluded.name,
                        updated_at = excluded.updated_at
                """, (source_id, source_name, now_str))

            # 统计计数器
            new_count = 0
            updated_count = 0
            title_changed_count = 0
            success_sources = []

            for source_id, news_list in data.items.items():
                success_sources.append(source_id)

                for item in news_list:
                    try:
                        # 检查是否已存在（通过 URL + platform_id）
                        if item.url:
                            cursor.execute("""
                                SELECT id, title FROM news_items
                                WHERE url = ? AND platform_id = ?
                            """, (item.url, source_id))
                            existing = cursor.fetchone()

                            if existing:
                                # 已存在，更新记录
                                existing_id, existing_title = existing

                                # 检查标题是否变化
                                if existing_title != item.title:
                                    # 记录标题变更
                                    cursor.execute("""
                                        INSERT INTO title_changes
                                        (news_item_id, old_title, new_title, changed_at)
                                        VALUES (?, ?, ?, ?)
                                    """, (existing_id, existing_title, item.title, now_str))
                                    title_changed_count += 1

                                # 记录排名历史
                                cursor.execute("""
                                    INSERT INTO rank_history
                                    (news_item_id, rank, crawl_time, created_at)
                                    VALUES (?, ?, ?, ?)
                                """, (existing_id, item.rank, data.crawl_time, now_str))

                                # 更新现有记录
                                cursor.execute("""
                                    UPDATE news_items SET
                                        title = ?,
                                        rank = ?,
                                        mobile_url = ?,
                                        content = ?,
                                        last_crawl_time = ?,
                                        crawl_count = crawl_count + 1,
                                        updated_at = ?
                                    WHERE id = ?
                                """, (item.title, item.rank, item.mobile_url, item.content,
                                      data.crawl_time, now_str, existing_id))
                                updated_count += 1
                            else:
                                # 不存在，插入新记录
                                cursor.execute("""
                                    INSERT INTO news_items
                                    (title, platform_id, rank, url, mobile_url, content,
                                     first_crawl_time, last_crawl_time, crawl_count,
                                     created_at, updated_at)
                                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
                                """, (item.title, source_id, item.rank, item.url,
                                      item.mobile_url, item.content, data.crawl_time, data.crawl_time,
                                      now_str, now_str))
                                new_id = cursor.lastrowid
                                # 记录初始排名
                                cursor.execute("""
                                    INSERT INTO rank_history
                                    (news_item_id, rank, crawl_time, created_at)
                                    VALUES (?, ?, ?, ?)
                                """, (new_id, item.rank, data.crawl_time, now_str))
                                new_count += 1
                        else:
                            # URL 为空的情况，直接插入（不做去重）
                            cursor.execute("""
                                INSERT INTO news_items
                                (title, platform_id, rank, url, mobile_url, content,
                                 first_crawl_time, last_crawl_time, crawl_count,
                                 created_at, updated_at)
                                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
                            """, (item.title, source_id, item.rank, item.url,
                                  item.mobile_url, item.content, data.crawl_time, data.crawl_time,
                                  now_str, now_str))
                            new_id = cursor.lastrowid
                            # 记录初始排名
                            cursor.execute("""
                                INSERT INTO rank_history
                                (news_item_id, rank, crawl_time, created_at)
                                VALUES (?, ?, ?, ?)
                            """, (new_id, item.rank, data.crawl_time, now_str))
                            new_count += 1

                    except sqlite3.Error as e:
                        print(f"保存新闻条目失败 [{item.title[:30]}...]: {e}")

            total_items = new_count + updated_count

            # 记录抓取信息
            cursor.execute("""
                INSERT OR REPLACE INTO crawl_records
                (crawl_time, total_items, created_at)
                VALUES (?, ?, ?)
            """, (data.crawl_time, total_items, now_str))

            # 获取刚插入的 crawl_record 的 ID
            cursor.execute("""
                SELECT id FROM crawl_records WHERE crawl_time = ?
            """, (data.crawl_time,))
            record_row = cursor.fetchone()
            if record_row:
                crawl_record_id = record_row[0]

                # 记录成功的来源
                for source_id in success_sources:
                    cursor.execute("""
                        INSERT OR REPLACE INTO crawl_source_status
                        (crawl_record_id, platform_id, status)
                        VALUES (?, ?, 'success')
                    """, (crawl_record_id, source_id))

                # 记录失败的来源
                for failed_id in data.failed_ids:
                    # 确保失败的平台也在 platforms 表中
                    cursor.execute("""
                        INSERT OR IGNORE INTO platforms (id, name, updated_at)
                        VALUES (?, ?, ?)
                    """, (failed_id, failed_id, now_str))

                    cursor.execute("""
                        INSERT OR REPLACE INTO crawl_source_status
                        (crawl_record_id, platform_id, status)
                        VALUES (?, ?, 'failed')
                    """, (crawl_record_id, failed_id))

            conn.commit()

            # 输出详细的存储统计日志
            log_parts = [f"[本地存储] 处理完成：新增 {new_count} 条"]
            if updated_count > 0:
                log_parts.append(f"更新 {updated_count} 条")
            if title_changed_count > 0:
                log_parts.append(f"标题变更 {title_changed_count} 条")
            print("，".join(log_parts))

            return True

        except Exception as e:
            print(f"[本地存储] 保存失败: {e}")
            return False

    def get_today_all_data(self, date: Optional[str] = None) -> Optional[NewsData]:
        """
        获取指定日期的所有新闻数据（合并后）

        Args:
            date: 日期字符串，默认为今天

        Returns:
            合并后的新闻数据
        """
        try:
            db_path = self._get_db_path(date)
            if not db_path.exists():
                return None

            conn = self._get_connection(date)
            cursor = conn.cursor()

            # 获取所有新闻数据（包含 id 用于查询排名历史）
            cursor.execute("""
                SELECT n.id, n.title, n.platform_id, p.name as platform_name,
                       n.rank, n.url, n.mobile_url,
                       n.first_crawl_time, n.last_crawl_time, n.crawl_count, n.content
                FROM news_items n
                LEFT JOIN platforms p ON n.platform_id = p.id
                ORDER BY n.platform_id, n.last_crawl_time
            """)

            rows = cursor.fetchall()
            if not rows:
                return None

            # 收集所有 news_item_id
            news_ids = [row[0] for row in rows]

            # 批量查询排名历史
            rank_history_map: Dict[int, List[int]] = {}
            if news_ids:
                placeholders = ",".join("?" * len(news_ids))
                cursor.execute(f"""
                    SELECT news_item_id, rank FROM rank_history
                    WHERE news_item_id IN ({placeholders})
                    ORDER BY news_item_id, crawl_time
                """, news_ids)
                for rh_row in cursor.fetchall():
                    news_id, rank = rh_row[0], rh_row[1]
                    if news_id not in rank_history_map:
                        rank_history_map[news_id] = []
                    if rank not in rank_history_map[news_id]:
                        rank_history_map[news_id].append(rank)

            # 按 platform_id 分组
            items: Dict[str, List[NewsItem]] = {}
            id_to_name: Dict[str, str] = {}
            crawl_date = self._format_date_folder(date)

            for row in rows:
                news_id = row[0]
                platform_id = row[2]
                title = row[1]
                platform_name = row[3] or platform_id

                id_to_name[platform_id] = platform_name

                if platform_id not in items:
                    items[platform_id] = []

                # 获取排名历史，如果没有则使用当前排名
                ranks = rank_history_map.get(news_id, [row[4]])

                items[platform_id].append(NewsItem(
                    title=title,
                    source_id=platform_id,
                    source_name=platform_name,
                    rank=row[4],
                    url=row[5] or "",
                    mobile_url=row[6] or "",
                    content=row[10] or "", # Added content
                    crawl_time=row[8],  # last_crawl_time
                    ranks=ranks,
                    first_time=row[7],  # first_crawl_time
                    last_time=row[8],   # last_crawl_time
                    count=row[9],       # crawl_count
                ))

            final_items = items

            # 获取失败的来源
            cursor.execute("""
                SELECT DISTINCT css.platform_id
                FROM crawl_source_status css
                JOIN crawl_records cr ON css.crawl_record_id = cr.id
                WHERE css.status = 'failed'
            """)
            failed_ids = [row[0] for row in cursor.fetchall()]

            # 获取最新的抓取时间
            cursor.execute("""
                SELECT crawl_time FROM crawl_records
                ORDER BY crawl_time DESC
                LIMIT 1
            """)

            time_row = cursor.fetchone()
            crawl_time = time_row[0] if time_row else self._format_time_filename()

            return NewsData(
                date=crawl_date,
                crawl_time=crawl_time,
                items=final_items,
                id_to_name=id_to_name,
                failed_ids=failed_ids,
            )

        except Exception as e:
            print(f"[本地存储] 读取数据失败: {e}")
            return None

    def get_latest_crawl_data(self, date: Optional[str] = None) -> Optional[NewsData]:
        """
        获取最新一次抓取的数据

        Args:
            date: 日期字符串，默认为今天

        Returns:
            最新抓取的新闻数据
        """
        try:
            db_path = self._get_db_path(date)
            if not db_path.exists():
                return None

            conn = self._get_connection(date)
            cursor = conn.cursor()

            # 获取最新的抓取时间
            cursor.execute("""
                SELECT crawl_time FROM crawl_records
                ORDER BY crawl_time DESC
                LIMIT 1
            """)

            time_row = cursor.fetchone()
            if not time_row:
                return None

            latest_time = time_row[0]

            # 获取该时间的新闻数据（包含 id 用于查询排名历史）
            cursor.execute("""
                SELECT n.id, n.title, n.platform_id, p.name as platform_name,
                       n.rank, n.url, n.mobile_url,
                       n.first_crawl_time, n.last_crawl_time, n.crawl_count, n.content
                FROM news_items n
                LEFT JOIN platforms p ON n.platform_id = p.id
                WHERE n.last_crawl_time = ?
            """, (latest_time,))

            rows = cursor.fetchall()
            if not rows:
                return None

            # 收集所有 news_item_id
            news_ids = [row[0] for row in rows]

            # 批量查询排名历史
            rank_history_map: Dict[int, List[int]] = {}
            if news_ids:
                placeholders = ",".join("?" * len(news_ids))
                cursor.execute(f"""
                    SELECT news_item_id, rank FROM rank_history
                    WHERE news_item_id IN ({placeholders})
                    ORDER BY news_item_id, crawl_time
                """, news_ids)
                for rh_row in cursor.fetchall():
                    news_id, rank = rh_row[0], rh_row[1]
                    if news_id not in rank_history_map:
                        rank_history_map[news_id] = []
                    if rank not in rank_history_map[news_id]:
                        rank_history_map[news_id].append(rank)

            items: Dict[str, List[NewsItem]] = {}
            id_to_name: Dict[str, str] = {}
            crawl_date = self._format_date_folder(date)

            for row in rows:
                news_id = row[0]
                platform_id = row[2]
                platform_name = row[3] or platform_id
                id_to_name[platform_id] = platform_name

                if platform_id not in items:
                    items[platform_id] = []

                # 获取排名历史，如果没有则使用当前排名
                ranks = rank_history_map.get(news_id, [row[4]])

                items[platform_id].append(NewsItem(
                    title=row[1],
                    source_id=platform_id,
                    source_name=platform_name,
                    rank=row[4],
                    url=row[5] or "",
                    mobile_url=row[6] or "",
                    content=row[10] or "", # Added content
                    crawl_time=row[8],  # last_crawl_time
                    ranks=ranks,
                    first_time=row[7],  # first_crawl_time
                    last_time=row[8],   # last_crawl_time
                    count=row[9],       # crawl_count
                ))

            # 获取失败的来源（针对最新一次抓取）
            cursor.execute("""
                SELECT css.platform_id
                FROM crawl_source_status css
                JOIN crawl_records cr ON css.crawl_record_id = cr.id
                WHERE cr.crawl_time = ? AND css.status = 'failed'
            """, (latest_time,))

            failed_ids = [row[0] for row in cursor.fetchall()]

            return NewsData(
                date=crawl_date,
                crawl_time=latest_time,
                items=items,
                id_to_name=id_to_name,
                failed_ids=failed_ids,
            )

        except Exception as e:
            print(f"[本地存储] 获取最新数据失败: {e}")
            return None

    def detect_new_titles(self, current_data: NewsData) -> Dict[str, Dict]:
        """
        检测新增的标题

        Args:
            current_data: 当前抓取的数据

        Returns:
            新增的标题数据 {source_id: {title: NewsItem}}
        """
        try:
            # 获取历史数据
            historical_data = self.get_today_all_data(current_data.date)

            if not historical_data:
                # 没有历史数据，所有都是新的
                new_titles = {}
                for source_id, news_list in current_data.items.items():
                    new_titles[source_id] = {item.title: item for item in news_list}
                return new_titles

            # 收集历史标题
            historical_titles: Dict[str, set] = {}
            for source_id, news_list in historical_data.items.items():
                historical_titles[source_id] = {item.title for item in news_list}

            # 检测新增
            new_titles = {}
            for source_id, news_list in current_data.items.items():
                hist_set = historical_titles.get(source_id, set())
                for item in news_list:
                    if item.title not in hist_set:
                        if source_id not in new_titles:
                            new_titles[source_id] = {}
                        new_titles[source_id][item.title] = item

            return new_titles

        except Exception as e:
            print(f"[本地存储] 检测新标题失败: {e}")
            return {}

    def save_txt_snapshot(self, data: NewsData) -> Optional[str]:
        """
        保存 TXT 快照

        Args:
            data: 新闻数据

        Returns:
            保存的文件路径
        """
        if not self.enable_txt:
            return None

        try:
            date_folder = self._format_date_folder(data.date)
            txt_dir = self.data_dir / date_folder / "txt"
            txt_dir.mkdir(parents=True, exist_ok=True)

            file_path = txt_dir / f"{data.crawl_time}.txt"

            with open(file_path, "w", encoding="utf-8") as f:
                for source_id, news_list in data.items.items():
                    source_name = data.id_to_name.get(source_id, source_id)

                    # 写入来源标题
                    if source_name and source_name != source_id:
                        f.write(f"{source_id} | {source_name}\n")
                    else:
                        f.write(f"{source_id}\n")

                    # 按排名排序
                    sorted_news = sorted(news_list, key=lambda x: x.rank)

                    for item in sorted_news:
                        line = f"{item.rank}. {item.title}"
                        if item.url:
                            line += f" [URL:{item.url}]"
                        if item.mobile_url:
                            line += f" [MOBILE:{item.mobile_url}]"
                        f.write(line + "\n")

                    f.write("\n")

                # 写入失败的来源
                if data.failed_ids:
                    f.write("==== 以下ID请求失败 ====\n")
                    for failed_id in data.failed_ids:
                        f.write(f"{failed_id}\n")

            print(f"[本地存储] TXT 快照已保存: {file_path}")
            return str(file_path)

        except Exception as e:
            print(f"[本地存储] 保存 TXT 快照失败: {e}")
            return None

    def save_html_report(self, html_content: str, filename: str, is_summary: bool = False) -> Optional[str]:
        """
        保存 HTML 报告

        Args:
            html_content: HTML 内容
            filename: 文件名
            is_summary: 是否为汇总报告

        Returns:
            保存的文件路径
        """
        if not self.enable_html:
            return None

        try:
            date_folder = self._format_date_folder()
            html_dir = self.data_dir / date_folder / "html"
            html_dir.mkdir(parents=True, exist_ok=True)

            file_path = html_dir / filename

            with open(file_path, "w", encoding="utf-8") as f:
                f.write(html_content)

            print(f"[本地存储] HTML 报告已保存: {file_path}")
            return str(file_path)

        except Exception as e:
            print(f"[本地存储] 保存 HTML 报告失败: {e}")
            return None

    def is_first_crawl_today(self, date: Optional[str] = None) -> bool:
        """
        检查是否是当天第一次抓取

        Args:
            date: 日期字符串，默认为今天

        Returns:
            是否是第一次抓取
        """
        try:
            db_path = self._get_db_path(date)
            if not db_path.exists():
                return True

            conn = self._get_connection(date)
            cursor = conn.cursor()

            cursor.execute("""
                SELECT COUNT(*) as count FROM crawl_records
            """)

            row = cursor.fetchone()
            count = row[0] if row else 0

            # 如果只有一条或没有记录，视为第一次抓取
            return count <= 1

        except Exception as e:
            print(f"[本地存储] 检查首次抓取失败: {e}")
            return True

    def get_crawl_times(self, date: Optional[str] = None) -> List[str]:
        """
        获取指定日期的所有抓取时间列表

        Args:
            date: 日期字符串，默认为今天

        Returns:
            抓取时间列表（按时间排序）
        """
        try:
            db_path = self._get_db_path(date)
            if not db_path.exists():
                return []

            conn = self._get_connection(date)
            cursor = conn.cursor()

            cursor.execute("""
                SELECT crawl_time FROM crawl_records
                ORDER BY crawl_time
            """)

            rows = cursor.fetchall()
            return [row[0] for row in rows]

        except Exception as e:
            print(f"[本地存储] 获取抓取时间列表失败: {e}")
            return []

    def cleanup(self) -> None:
        """清理资源（关闭数据库连接）"""
        for db_path, conn in self._db_connections.items():
            try:
                conn.close()
                print(f"[本地存储] 关闭数据库连接: {db_path}")
            except Exception as e:
                print(f"[本地存储] 关闭连接失败 {db_path}: {e}")

        self._db_connections.clear()

    def cleanup_old_data(self, retention_days: int) -> int:
        """
        清理过期数据

        Args:
            retention_days: 保留天数（0 表示不清理）

        Returns:
            删除的日期目录数量
        """
        if retention_days <= 0:
            return 0

        deleted_count = 0
        cutoff_date = self._get_configured_time() - timedelta(days=retention_days)

        try:
            if not self.data_dir.exists():
                return 0

            for date_folder in self.data_dir.iterdir():
                if not date_folder.is_dir() or date_folder.name.startswith('.'):
                    continue

                # 解析日期文件夹名（支持两种格式）
                folder_date = None
                try:
                    # ISO 格式: YYYY-MM-DD
                    date_match = re.match(r'(\d{4})-(\d{2})-(\d{2})', date_folder.name)
                    if date_match:
                        folder_date = datetime(
                            int(date_match.group(1)),
                            int(date_match.group(2)),
                            int(date_match.group(3)),
                            tzinfo=pytz.timezone("Asia/Shanghai")
                        )
                    else:
                        # 旧中文格式: YYYY年MM月DD日
                        date_match = re.match(r'(\d{4})年(\d{2})月(\d{2})日', date_folder.name)
                        if date_match:
                            folder_date = datetime(
                                int(date_match.group(1)),
                                int(date_match.group(2)),
                                int(date_match.group(3)),
                                tzinfo=pytz.timezone("Asia/Shanghai")
                            )
                except Exception:
                    continue

                if folder_date and folder_date < cutoff_date:
                    # 先关闭该日期的数据库连接
                    db_path = str(self._get_db_path(date_folder.name))
                    if db_path in self._db_connections:
                        try:
                            self._db_connections[db_path].close()
                            del self._db_connections[db_path]
                        except Exception:
                            pass

                    # 删除整个日期目录
                    try:
                        shutil.rmtree(date_folder)
                        deleted_count += 1
                        print(f"[本地存储] 清理过期数据: {date_folder.name}")
                    except Exception as e:
                        print(f"[本地存储] 删除目录失败 {date_folder.name}: {e}")

            if deleted_count > 0:
                print(f"[本地存储] 共清理 {deleted_count} 个过期日期目录")

            return deleted_count

        except Exception as e:
            print(f"[本地存储] 清理过期数据失败: {e}")
            return deleted_count

    def has_pushed_today(self, date: Optional[str] = None) -> bool:
        """
        检查指定日期是否已推送过

        Args:
            date: 日期字符串（YYYY-MM-DD），默认为今天

        Returns:
            是否已推送
        """
        try:
            conn = self._get_connection(date)
            cursor = conn.cursor()

            target_date = self._format_date_folder(date)

            cursor.execute("""
                SELECT pushed FROM push_records WHERE date = ?
            """, (target_date,))

            row = cursor.fetchone()
            if row:
                return bool(row[0])
            return False

        except Exception as e:
            print(f"[本地存储] 检查推送记录失败: {e}")
            return False

    def record_push(self, report_type: str, date: Optional[str] = None) -> bool:
        """
        记录推送

        Args:
            report_type: 报告类型
            date: 日期字符串（YYYY-MM-DD），默认为今天

        Returns:
            是否记录成功
        """
        try:
            conn = self._get_connection(date)
            cursor = conn.cursor()

            target_date = self._format_date_folder(date)
            now_str = self._get_configured_time().strftime("%Y-%m-%d %H:%M:%S")

            cursor.execute("""
                INSERT INTO push_records (date, pushed, push_time, report_type, created_at)
                VALUES (?, 1, ?, ?, ?)
                ON CONFLICT(date) DO UPDATE SET
                    pushed = 1,
                    push_time = excluded.push_time,
                    report_type = excluded.report_type
            """, (target_date, now_str, report_type, now_str))

            conn.commit()

            print(f"[本地存储] 推送记录已保存: {report_type} at {now_str}")
            return True

        except Exception as e:
            print(f"[本地存储] 记录推送失败: {e}")
            return False

    def __del__(self):
        """析构函数，确保关闭连接"""
        self.cleanup()
