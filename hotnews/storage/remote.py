# coding=utf-8
"""
远程存储后端（S3 兼容协议）

支持 Cloudflare R2、阿里云 OSS、腾讯云 COS、AWS S3、MinIO 等
使用 S3 兼容 API (boto3) 访问对象存储
数据流程：下载当天 SQLite → 合并新数据 → 上传回远程
"""

import atexit
import os
import pytz
import re
import shutil
import sys
import tempfile
import sqlite3
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Optional, Any

try:
    import boto3
    from botocore.config import Config as BotoConfig
    from botocore.exceptions import ClientError
    HAS_BOTO3 = True
except ImportError:
    HAS_BOTO3 = False
    boto3 = None
    BotoConfig = None
    ClientError = Exception

from hotnews.storage.base import StorageBackend, NewsItem, NewsData
from hotnews.utils.time import (
    get_configured_time,
    format_date_folder,
    format_time_filename,
)


class RemoteStorageBackend(StorageBackend):
    """
    远程云存储后端（S3 兼容协议）

    特点：
    - 使用 S3 兼容 API 访问远程存储
    - 支持 Cloudflare R2、阿里云 OSS、腾讯云 COS、AWS S3、MinIO 等
    - 下载 SQLite 到临时目录进行操作
    - 支持数据合并和上传
    - 支持从远程拉取历史数据到本地
    - 运行结束后自动清理临时文件
    """

    def __init__(
        self,
        bucket_name: str,
        access_key_id: str,
        secret_access_key: str,
        endpoint_url: str,
        region: str = "",
        enable_txt: bool = False,  # 远程模式默认不生成 TXT
        enable_html: bool = True,
        temp_dir: Optional[str] = None,
        timezone: str = "Asia/Shanghai",
    ):
        """
        初始化远程存储后端

        Args:
            bucket_name: 存储桶名称
            access_key_id: 访问密钥 ID
            secret_access_key: 访问密钥
            endpoint_url: 服务端点 URL
            region: 区域（可选，部分服务商需要）
            enable_txt: 是否启用 TXT 快照（默认关闭）
            enable_html: 是否启用 HTML 报告
            temp_dir: 临时目录路径（默认使用系统临时目录）
            timezone: 时区配置（默认 Asia/Shanghai）
        """
        if not HAS_BOTO3:
            raise ImportError("远程存储后端需要安装 boto3: pip install boto3")

        self.bucket_name = bucket_name
        self.endpoint_url = endpoint_url
        self.region = region
        self.enable_txt = enable_txt
        self.enable_html = enable_html
        self.timezone = timezone

        # 创建临时目录
        self.temp_dir = Path(temp_dir) if temp_dir else Path(tempfile.mkdtemp(prefix="hotnews_"))
        self.temp_dir.mkdir(parents=True, exist_ok=True)

        # 初始化 S3 客户端
        # 使用 virtual-hosted style addressing（主流）
        # 使用 s3 签名版本（v2），避免 s3v4 签名可能导致的 chunked encoding 问题
        s3_config = BotoConfig(
            s3={"addressing_style": "virtual"},
            signature_version='s3',  # 使用 S3v2 签名，兼容性更好
        )

        client_kwargs = {
            "endpoint_url": endpoint_url,
            "aws_access_key_id": access_key_id,
            "aws_secret_access_key": secret_access_key,
            "config": s3_config,
        }
        if region:
            client_kwargs["region_name"] = region

        self.s3_client = boto3.client("s3", **client_kwargs)

        # 跟踪下载的文件（用于清理）
        self._downloaded_files: List[Path] = []
        self._db_connections: Dict[str, sqlite3.Connection] = {}

        print(f"[远程存储] 初始化完成，存储桶: {bucket_name}")

    @property
    def backend_name(self) -> str:
        return "remote"

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

    def _get_remote_db_key(self, date: Optional[str] = None) -> str:
        """获取远程存储中 SQLite 文件的对象键"""
        date_folder = self._format_date_folder(date)
        return f"news/{date_folder}.db"

    def _get_local_db_path(self, date: Optional[str] = None) -> Path:
        """获取本地临时 SQLite 文件路径"""
        date_folder = self._format_date_folder(date)
        return self.temp_dir / date_folder / "news.db"

    def _check_object_exists(self, r2_key: str) -> bool:
        """
        检查远程存储中对象是否存在

        Args:
            r2_key: 远程对象键

        Returns:
            是否存在
        """
        try:
            self.s3_client.head_object(Bucket=self.bucket_name, Key=r2_key)
            return True
        except ClientError as e:
            error_code = e.response.get("Error", {}).get("Code", "")
            # S3 兼容存储可能返回 404, NoSuchKey, 或其他变体
            if error_code in ("404", "NoSuchKey", "Not Found"):
                return False
            # 其他错误（如权限问题）也视为不存在，但打印警告
            print(f"[远程存储] 检查对象存在性失败 ({r2_key}): {e}")
            return False
        except Exception as e:
            print(f"[远程存储] 检查对象存在性异常 ({r2_key}): {e}")
            return False

    def _download_sqlite(self, date: Optional[str] = None) -> Optional[Path]:
        """
        从远程存储下载当天的 SQLite 文件到本地临时目录

        使用 get_object + iter_chunks 替代 download_file，
        以正确处理腾讯云 COS 的 chunked transfer encoding。

        Args:
            date: 日期字符串

        Returns:
            本地文件路径，如果不存在返回 None
        """
        r2_key = self._get_remote_db_key(date)
        local_path = self._get_local_db_path(date)

        # 确保目录存在
        local_path.parent.mkdir(parents=True, exist_ok=True)

        # 先检查文件是否存在
        if not self._check_object_exists(r2_key):
            print(f"[远程存储] 文件不存在，将创建新数据库: {r2_key}")
            return None

        try:
            # 使用 get_object + iter_chunks 替代 download_file
            # iter_chunks 会自动处理 chunked transfer encoding
            response = self.s3_client.get_object(Bucket=self.bucket_name, Key=r2_key)
            with open(local_path, 'wb') as f:
                for chunk in response['Body'].iter_chunks(chunk_size=1024*1024):
                    f.write(chunk)
            self._downloaded_files.append(local_path)
            print(f"[远程存储] 已下载: {r2_key} -> {local_path}")
            return local_path
        except ClientError as e:
            error_code = e.response.get("Error", {}).get("Code", "")
            # S3 兼容存储可能返回不同的错误码
            if error_code in ("404", "NoSuchKey", "Not Found"):
                print(f"[远程存储] 文件不存在，将创建新数据库: {r2_key}")
                return None
            else:
                print(f"[远程存储] 下载失败 (错误码: {error_code}): {e}")
                raise
        except Exception as e:
            print(f"[远程存储] 下载异常: {e}")
            raise

    def _upload_sqlite(self, date: Optional[str] = None) -> bool:
        """
        上传本地 SQLite 文件到远程存储

        Args:
            date: 日期字符串

        Returns:
            是否上传成功
        """
        local_path = self._get_local_db_path(date)
        r2_key = self._get_remote_db_key(date)

        if not local_path.exists():
            print(f"[远程存储] 本地文件不存在，无法上传: {local_path}")
            return False

        try:
            # 获取本地文件大小
            local_size = local_path.stat().st_size
            print(f"[远程存储] 准备上传: {local_path} ({local_size} bytes) -> {r2_key}")

            # 读取文件内容为 bytes 后上传
            # 避免传入文件对象时 requests 库使用 chunked transfer encoding
            # 腾讯云 COS 等 S3 兼容服务可能无法正确处理 chunked encoding
            with open(local_path, 'rb') as f:
                file_content = f.read()

            # 使用 put_object 并明确设置 ContentLength，确保不使用 chunked encoding
            self.s3_client.put_object(
                Bucket=self.bucket_name,
                Key=r2_key,
                Body=file_content,
                ContentLength=local_size,
                ContentType='application/octet-stream',
            )
            print(f"[远程存储] 已上传: {local_path} -> {r2_key}")

            # 验证上传成功
            if self._check_object_exists(r2_key):
                print(f"[远程存储] 上传验证成功: {r2_key}")
                return True
            else:
                print(f"[远程存储] 上传验证失败: 文件未在远程存储中找到")
                return False

        except Exception as e:
            print(f"[远程存储] 上传失败: {e}")
            return False

    def _get_connection(self, date: Optional[str] = None) -> sqlite3.Connection:
        """获取数据库连接"""
        local_path = self._get_local_db_path(date)
        db_path = str(local_path)

        if db_path not in self._db_connections:
            # 确保目录存在
            local_path.parent.mkdir(parents=True, exist_ok=True)

            # 如果本地不存在，尝试从远程存储下载
            if not local_path.exists():
                self._download_sqlite(date)

            conn = sqlite3.connect(db_path)
            conn.row_factory = sqlite3.Row
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

    def save_news_data(self, data: NewsData) -> bool:
        """
        保存新闻数据到远程存储（以 URL 为唯一标识，支持标题更新检测）

        流程：下载现有数据库 → 插入/更新数据 → 上传回远程存储

        Args:
            data: 新闻数据

        Returns:
            是否保存成功
        """
        try:
            conn = self._get_connection(data.date)
            cursor = conn.cursor()

            # 查询已有记录数
            cursor.execute("SELECT COUNT(*) as count FROM news_items")
            row = cursor.fetchone()
            existing_count = row[0] if row else 0
            if existing_count > 0:
                print(f"[远程存储] 已有 {existing_count} 条历史记录，将合并新数据")

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
                                        last_crawl_time = ?,
                                        crawl_count = crawl_count + 1,
                                        updated_at = ?
                                    WHERE id = ?
                                """, (item.title, item.rank, item.mobile_url,
                                      data.crawl_time, now_str, existing_id))
                                updated_count += 1
                            else:
                                # 不存在，插入新记录
                                cursor.execute("""
                                    INSERT INTO news_items
                                    (title, platform_id, rank, url, mobile_url,
                                     first_crawl_time, last_crawl_time, crawl_count,
                                     created_at, updated_at)
                                    VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
                                """, (item.title, source_id, item.rank, item.url,
                                      item.mobile_url, data.crawl_time, data.crawl_time,
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
                                (title, platform_id, rank, url, mobile_url,
                                 first_crawl_time, last_crawl_time, crawl_count,
                                 created_at, updated_at)
                                VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
                            """, (item.title, source_id, item.rank, item.url,
                                  item.mobile_url, data.crawl_time, data.crawl_time,
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
                        print(f"[远程存储] 保存新闻条目失败 [{item.title[:30]}...]: {e}")

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

            # 查询合并后的总记录数
            cursor.execute("SELECT COUNT(*) as count FROM news_items")
            row = cursor.fetchone()
            final_count = row[0] if row else 0

            # 输出详细的存储统计日志
            log_parts = [f"[远程存储] 处理完成：新增 {new_count} 条"]
            if updated_count > 0:
                log_parts.append(f"更新 {updated_count} 条")
            if title_changed_count > 0:
                log_parts.append(f"标题变更 {title_changed_count} 条")
            log_parts.append(f"(去重后总计: {final_count} 条)")
            print("，".join(log_parts))

            # 上传到远程存储
            if self._upload_sqlite(data.date):
                print(f"[远程存储] 数据已同步到远程存储")
                return True
            else:
                print(f"[远程存储] 上传远程存储失败")
                return False

        except Exception as e:
            print(f"[远程存储] 保存失败: {e}")
            return False

    def get_today_all_data(self, date: Optional[str] = None) -> Optional[NewsData]:
        """获取指定日期的所有新闻数据（合并后）"""
        try:
            conn = self._get_connection(date)
            cursor = conn.cursor()

            # 获取所有新闻数据（包含 id 用于查询排名历史）
            cursor.execute("""
                SELECT n.id, n.title, n.platform_id, p.name as platform_name,
                       n.rank, n.url, n.mobile_url,
                       n.first_crawl_time, n.last_crawl_time, n.crawl_count
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
            print(f"[远程存储] 读取数据失败: {e}")
            return None

    def get_latest_crawl_data(self, date: Optional[str] = None) -> Optional[NewsData]:
        """获取最新一次抓取的数据"""
        try:
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

            # 获取该时间的新闻数据，通过 JOIN 获取平台名称
            cursor.execute("""
                SELECT n.title, n.platform_id, p.name as platform_name,
                       n.rank, n.url, n.mobile_url,
                       n.first_crawl_time, n.last_crawl_time, n.crawl_count
                FROM news_items n
                LEFT JOIN platforms p ON n.platform_id = p.id
                WHERE n.last_crawl_time = ?
            """, (latest_time,))

            rows = cursor.fetchall()
            if not rows:
                return None

            items: Dict[str, List[NewsItem]] = {}
            id_to_name: Dict[str, str] = {}
            crawl_date = self._format_date_folder(date)

            for row in rows:
                platform_id = row[1]
                platform_name = row[2] or platform_id
                id_to_name[platform_id] = platform_name

                if platform_id not in items:
                    items[platform_id] = []

                items[platform_id].append(NewsItem(
                    title=row[0],
                    source_id=platform_id,
                    source_name=platform_name,
                    rank=row[3],
                    url=row[4] or "",
                    mobile_url=row[5] or "",
                    crawl_time=row[7],  # last_crawl_time
                    ranks=[row[3]],
                    first_time=row[6],  # first_crawl_time
                    last_time=row[7],   # last_crawl_time
                    count=row[8],       # crawl_count
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
            print(f"[远程存储] 获取最新数据失败: {e}")
            return None

    def detect_new_titles(self, current_data: NewsData) -> Dict[str, Dict]:
        """检测新增的标题"""
        try:
            historical_data = self.get_today_all_data(current_data.date)

            if not historical_data:
                new_titles = {}
                for source_id, news_list in current_data.items.items():
                    new_titles[source_id] = {item.title: item for item in news_list}
                return new_titles

            historical_titles: Dict[str, set] = {}
            for source_id, news_list in historical_data.items.items():
                historical_titles[source_id] = {item.title for item in news_list}

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
            print(f"[远程存储] 检测新标题失败: {e}")
            return {}

    def save_txt_snapshot(self, data: NewsData) -> Optional[str]:
        """保存 TXT 快照（远程存储模式下默认不支持）"""
        if not self.enable_txt:
            return None

        # 如果启用，保存到本地临时目录
        try:
            date_folder = self._format_date_folder(data.date)
            txt_dir = self.temp_dir / date_folder / "txt"
            txt_dir.mkdir(parents=True, exist_ok=True)

            file_path = txt_dir / f"{data.crawl_time}.txt"

            with open(file_path, "w", encoding="utf-8") as f:
                for source_id, news_list in data.items.items():
                    source_name = data.id_to_name.get(source_id, source_id)

                    if source_name and source_name != source_id:
                        f.write(f"{source_id} | {source_name}\n")
                    else:
                        f.write(f"{source_id}\n")

                    sorted_news = sorted(news_list, key=lambda x: x.rank)

                    for item in sorted_news:
                        line = f"{item.rank}. {item.title}"
                        if item.url:
                            line += f" [URL:{item.url}]"
                        if item.mobile_url:
                            line += f" [MOBILE:{item.mobile_url}]"
                        f.write(line + "\n")

                    f.write("\n")

                if data.failed_ids:
                    f.write("==== 以下ID请求失败 ====\n")
                    for failed_id in data.failed_ids:
                        f.write(f"{failed_id}\n")

            print(f"[远程存储] TXT 快照已保存: {file_path}")
            return str(file_path)

        except Exception as e:
            print(f"[远程存储] 保存 TXT 快照失败: {e}")
            return None

    def save_html_report(self, html_content: str, filename: str, is_summary: bool = False) -> Optional[str]:
        """保存 HTML 报告到临时目录"""
        if not self.enable_html:
            return None

        try:
            date_folder = self._format_date_folder()
            html_dir = self.temp_dir / date_folder / "html"
            html_dir.mkdir(parents=True, exist_ok=True)

            file_path = html_dir / filename

            with open(file_path, "w", encoding="utf-8") as f:
                f.write(html_content)

            print(f"[远程存储] HTML 报告已保存: {file_path}")
            return str(file_path)

        except Exception as e:
            print(f"[远程存储] 保存 HTML 报告失败: {e}")
            return None

    def is_first_crawl_today(self, date: Optional[str] = None) -> bool:
        """检查是否是当天第一次抓取"""
        try:
            conn = self._get_connection(date)
            cursor = conn.cursor()

            cursor.execute("""
                SELECT COUNT(*) as count FROM crawl_records
            """)

            row = cursor.fetchone()
            count = row[0] if row else 0

            return count <= 1

        except Exception as e:
            print(f"[远程存储] 检查首次抓取失败: {e}")
            return True

    def cleanup(self) -> None:
        """清理资源（关闭连接和删除临时文件）"""
        # 检查 Python 是否正在关闭
        if sys.meta_path is None:
            return

        # 关闭数据库连接
        db_connections = getattr(self, "_db_connections", {})
        for db_path, conn in list(db_connections.items()):
            try:
                conn.close()
                print(f"[远程存储] 关闭数据库连接: {db_path}")
            except Exception as e:
                print(f"[远程存储] 关闭连接失败 {db_path}: {e}")

        if db_connections:
            db_connections.clear()

        # 删除临时目录
        temp_dir = getattr(self, "temp_dir", None)
        if temp_dir:
            try:
                if temp_dir.exists():
                    shutil.rmtree(temp_dir)
                    print(f"[远程存储] 临时目录已清理: {temp_dir}")
            except Exception as e:
                # 忽略 Python 关闭时的错误
                if sys.meta_path is not None:
                    print(f"[远程存储] 清理临时目录失败: {e}")

        downloaded_files = getattr(self, "_downloaded_files", None)
        if downloaded_files:
            downloaded_files.clear()

    def cleanup_old_data(self, retention_days: int) -> int:
        """
        清理远程存储上的过期数据

        Args:
            retention_days: 保留天数（0 表示不清理）

        Returns:
            删除的数据库文件数量
        """
        if retention_days <= 0:
            return 0

        deleted_count = 0
        cutoff_date = self._get_configured_time() - timedelta(days=retention_days)

        try:
            # 列出远程存储中 news/ 前缀下的所有对象
            paginator = self.s3_client.get_paginator('list_objects_v2')
            pages = paginator.paginate(Bucket=self.bucket_name, Prefix="news/")

            # 收集需要删除的对象键
            objects_to_delete = []
            deleted_dates = set()

            for page in pages:
                if 'Contents' not in page:
                    continue

                for obj in page['Contents']:
                    key = obj['Key']

                    # 解析日期（格式: news/YYYY-MM-DD.db 或 news/YYYY年MM月DD日.db）
                    folder_date = None
                    try:
                        # ISO 格式: news/YYYY-MM-DD.db
                        date_match = re.match(r'news/(\d{4})-(\d{2})-(\d{2})\.db$', key)
                        if date_match:
                            folder_date = datetime(
                                int(date_match.group(1)),
                                int(date_match.group(2)),
                                int(date_match.group(3)),
                                tzinfo=pytz.timezone("Asia/Shanghai")
                            )
                            date_str = f"{date_match.group(1)}-{date_match.group(2)}-{date_match.group(3)}"
                        else:
                            # 旧中文格式: news/YYYY年MM月DD日.db
                            date_match = re.match(r'news/(\d{4})年(\d{2})月(\d{2})日\.db$', key)
                            if date_match:
                                folder_date = datetime(
                                    int(date_match.group(1)),
                                    int(date_match.group(2)),
                                    int(date_match.group(3)),
                                    tzinfo=pytz.timezone("Asia/Shanghai")
                                )
                                date_str = f"{date_match.group(1)}年{date_match.group(2)}月{date_match.group(3)}日"
                    except Exception:
                        continue

                    if folder_date and folder_date < cutoff_date:
                        objects_to_delete.append({'Key': key})
                        deleted_dates.add(date_str)

            # 批量删除对象（每次最多 1000 个）
            if objects_to_delete:
                batch_size = 1000
                for i in range(0, len(objects_to_delete), batch_size):
                    batch = objects_to_delete[i:i + batch_size]
                    try:
                        self.s3_client.delete_objects(
                            Bucket=self.bucket_name,
                            Delete={'Objects': batch}
                        )
                        print(f"[远程存储] 删除 {len(batch)} 个对象")
                    except Exception as e:
                        print(f"[远程存储] 批量删除失败: {e}")

                deleted_count = len(deleted_dates)
                for date_str in sorted(deleted_dates):
                    print(f"[远程存储] 清理过期数据: news/{date_str}.db")

                print(f"[远程存储] 共清理 {deleted_count} 个过期日期数据库文件")

            return deleted_count

        except Exception as e:
            print(f"[远程存储] 清理过期数据失败: {e}")
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
            print(f"[远程存储] 检查推送记录失败: {e}")
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

            print(f"[远程存储] 推送记录已保存: {report_type} at {now_str}")

            # 上传到远程存储 确保记录持久化
            if self._upload_sqlite(date):
                print(f"[远程存储] 推送记录已同步到远程存储")
                return True
            else:
                print(f"[远程存储] 推送记录同步到远程存储失败")
                return False

        except Exception as e:
            print(f"[远程存储] 记录推送失败: {e}")
            return False

    def __del__(self):
        """析构函数"""
        # 检查 Python 是否正在关闭
        if sys.meta_path is None:
            return
        try:
            self.cleanup()
        except Exception:
            # Python 关闭时可能会出错，忽略即可
            pass

    def pull_recent_days(self, days: int, local_data_dir: str = "output") -> int:
        """
        从远程拉取最近 N 天的数据到本地

        Args:
            days: 拉取天数
            local_data_dir: 本地数据目录

        Returns:
            成功拉取的数据库文件数量
        """
        if days <= 0:
            return 0

        local_dir = Path(local_data_dir)
        local_dir.mkdir(parents=True, exist_ok=True)

        pulled_count = 0
        now = self._get_configured_time()

        print(f"[远程存储] 开始拉取最近 {days} 天的数据...")

        for i in range(days):
            date = now - timedelta(days=i)
            date_str = date.strftime("%Y-%m-%d")

            # 本地目标路径
            local_date_dir = local_dir / date_str
            local_db_path = local_date_dir / "news.db"

            # 如果本地已存在，跳过
            if local_db_path.exists():
                print(f"[远程存储] 跳过（本地已存在）: {date_str}")
                continue

            # 远程对象键
            remote_key = f"news/{date_str}.db"

            # 检查远程是否存在
            if not self._check_object_exists(remote_key):
                print(f"[远程存储] 跳过（远程不存在）: {date_str}")
                continue

            # 下载（使用 get_object + iter_chunks 处理 chunked encoding）
            try:
                local_date_dir.mkdir(parents=True, exist_ok=True)
                response = self.s3_client.get_object(Bucket=self.bucket_name, Key=remote_key)
                with open(local_db_path, 'wb') as f:
                    for chunk in response['Body'].iter_chunks(chunk_size=1024*1024):
                        f.write(chunk)
                print(f"[远程存储] 已拉取: {remote_key} -> {local_db_path}")
                pulled_count += 1
            except Exception as e:
                print(f"[远程存储] 拉取失败 ({date_str}): {e}")

        print(f"[远程存储] 拉取完成，共下载 {pulled_count} 个数据库文件")
        return pulled_count

    def list_remote_dates(self) -> List[str]:
        """
        列出远程存储中所有可用的日期

        Returns:
            日期字符串列表（YYYY-MM-DD 格式）
        """
        dates = []

        try:
            paginator = self.s3_client.get_paginator('list_objects_v2')
            pages = paginator.paginate(Bucket=self.bucket_name, Prefix="news/")

            for page in pages:
                if 'Contents' not in page:
                    continue

                for obj in page['Contents']:
                    key = obj['Key']
                    # 解析日期
                    date_match = re.match(r'news/(\d{4}-\d{2}-\d{2})\.db$', key)
                    if date_match:
                        dates.append(date_match.group(1))

            return sorted(dates, reverse=True)

        except Exception as e:
            print(f"[远程存储] 列出远程日期失败: {e}")
            return []
