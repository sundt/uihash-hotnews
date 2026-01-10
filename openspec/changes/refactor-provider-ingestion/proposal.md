# Change: 统一可扩展的 Provider 抓取接入层（支持 NBA 迁移与财新等站点抓取）

## Why
当前新增的数据源（例如 NBA）以“在 `hotnews/web/server.py` 内请求触发抓取 + 注入分类”的方式接入。
这种方式会导致：
- 抓取逻辑散落在 Web 层，职责混杂，长期难维护。
- 抓取频率不可控（页面刷新/多人访问会触发抓取），容易被限流，且增加接口延迟。
- 难以统一复用：代理、限速、重试、缓存 TTL、落库、metrics（包括 `content_hash/changed_count`）。

你后续还会接入更多平台（例如财新网新闻：只需要标题+链接），需要一个“可配置、可插拔、可调度、可落库”的统一模式。

## What Changes
- 引入统一的 **Provider 接入层**（插件化）：
  - 每个 Provider 负责从某个外部源抓取并输出 Hotnews 统一新闻结构（title/url/timestamp/rank）。
  - Provider 统一产生抓取 metrics，并与现有 `/api/fetch-metrics` 语义保持一致。
- 将 NBA 抓取从 `web/server.py` 迁移为 Provider（不再由 Web 请求触发），并通过定时任务落库。
- 新增一个“站点类（RSS/HTML）” Provider，用于接入财新等只需标题+链接的平台：
  - RSS 优先；RSS 不可用时提供 HTML 列表页 fallback。
- Viewer / API 改为“读取落库结果为主”，可选提供“手动触发刷新”的异步入口（不阻塞页面请求）。
- 在 `config/config.yaml` 提供 Provider 的启用/禁用、抓取频率、请求参数等配置项。

## Impact
- Affected specs:
  - `specs/sports-game-data/spec.md`（NBA 等结构化数据源迁移到 Provider）
  - `specs/news-viewer/spec.md`（viewer 数据加载链路：从请求触发抓取调整为读取落库结果）
- Affected code (expected):
  - `hotnews/crawler/`（新增 provider 抽象/注册表/调度入口）
  - `hotnews/web/server.py`（移除 NBA 的请求触发抓取路径，改为读取落库结果）
  - `config/config.yaml`

## Scope (Confirmed)
- 财新：仅抓取“标题 + 链接”（不抓全文）。
- 抓取模式：定时落库（后台任务/worker），viewer 只读。

## Open Questions
- 财新 RSS 索引/各栏目 feed 的最终可用 URL 需要在服务器实测确定（RSS 可能存在跳转或 UA 限制）。
- 站点类 Provider 的去重策略（按 URL、按标题、或标题+URL 的稳定哈希）。
