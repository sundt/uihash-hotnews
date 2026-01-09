# AI Context (Canonical)

本文件是 **AI 助手必读入口**（适用于 VSCode Claude / Windsurf / Claude Code 等）。

## 必读文件
- `docs/ai/AI_CONTEXT.md`（本文件）
- `docs/ai/AI_GUIDE.md`
- `docs/README.md`
- `openspec/AGENTS.md`（当涉及 proposal/spec/架构调整时必须遵循）

## 项目目的（TL;DR）
TrendRadar：多平台热点新闻聚合与 AI 分析工具（抓取、分类查看器、RSS、推送、MCP 分析）。

## 关键入口
- Web Server：`trendradar/web/server.py`
- 主配置：`config/config.yaml`（可被环境变量 `CONFIG_PATH` 覆盖）
- 搜索配置：`trendradar/search/config.py`（环境变量 `TREND_RADAR_*`）
- 前端模板：`trendradar/web/templates/`
- 前端 JS（模块化源码）：`trendradar/web/static/js/src/`

## 默认地址/端口（避免反复询问）

除非用户明确说“我要改地址/端口/服务器”，否则 AI 默认使用以下值，不要反复追问：

- 服务器 SSH：`root@120.77.222.205:52222`
- 服务器项目目录：`~/hotnews`
- Viewer：`http://127.0.0.1:8090`（健康检查：`http://127.0.0.1:8090/health`）
- API：`http://127.0.0.1:8080`
- MCP：`http://127.0.0.1:3333`

## 数据库与 Schema（SQLite）

数据库文件（运行时产物，通常在 `output/`，不建议提交到仓库）：
- 热点新闻日库：`output/YYYY-MM-DD/news.db`
- RSS 在线库：`output/online.db`
- 用户库：`output/user.db`
- 搜索索引库：`output/search_indexes/fts_index.db`

Schema/建表/迁移的权威来源（改表/加字段时必须同步更新对应位置）：
- 热点新闻日库（news.db）：`trendradar/storage/schema.sql`（由 `trendradar/storage/local.py` / `trendradar/storage/remote.py` 执行）
- RSS 在线库（online.db）：`trendradar/web/db_online.py`（含 `_ensure_column()` 的轻量加字段迁移）
- 用户库（user.db）：`trendradar/web/user_db.py`
- 搜索 FTS 索引库（fts_index.db）：`trendradar/search/fts_index.py`

## 工作方式（最低要求）
- 进行较大改动/新增能力/规范调整前：先走 OpenSpec（见 `openspec/AGENTS.md`）。
- 涉及前端行为变更：按 OpenSpec 要求跑 Playwright E2E（`npm test`）。

## 最近变更（维护建议）
- 仅保留最近 10 条，新增条目写在最上面。
- 示例格式：`YYYY-MM-DD: [area] 简述变更 + 关键文件`。

## 禁忌/安全
- 不要把 webhook/token/password 等敏感信息写入仓库或文档。
- 文档示例请使用占位符。
