# AI Guide (协作与维护)

## 1. 什么时候必须走 OpenSpec
- 涉及：proposal/spec/计划、引入新能力、破坏性改动、架构/安全/性能大改
- 操作：先读 `openspec/AGENTS.md`，在 `openspec/changes/<change-id>/` 写 `proposal.md/tasks.md/(design.md)/spec delta`，并通过审批后再实现。

## 1.1 默认环境信息（避免反复追问）
除非用户明确要改地址/端口/服务器，否则默认使用 `docs/ai/AI_CONTEXT.md` 里定义的“默认地址/端口”。

当请求缺少关键连接信息时：
- 优先回到 `docs/ai/AI_CONTEXT.md` 查默认值并直接使用
- 仅当用户说“要换服务器/端口/域名/目录”时，才询问新的值

## 1.2 Viewer 自动重启规则（避免手动操作）

由于 `hotnews-viewer` 容器未挂载源码目录（只挂载 `config/` 和 `output/`），因此改动代码/静态资源后不会自动生效。
当修改以下文件类型/路径时，AI 必须自动触发 viewer 重建与重启（而不是让用户手动重启）：

- `hotnews/web/static/**/*.css`（CSS）
- `hotnews/web/static/**/*.js`（JS，包含 `viewer.js` / `viewer.bundle.js`）
- `hotnews/web/templates/**/*.html`（模板/Jinja2）
- `hotnews/web/**/*.py`（viewer 后端路由/服务代码）
- `docker/Dockerfile.viewer`、`docker/docker-compose-build.yml`（镜像/compose 变更）

自动重启方式（按环境选择其一）：

- 本地（Docker）：运行 `bash docker/local-refresh-viewer.sh`（会 build + force-recreate + 等待 `/health`）。
- 服务器（线上）：运行 `bash deploy-rebuild.sh --message "..."`（全量重建三服务，包含 viewer；也会做 `/health` 验证）。

注意：服务端静态资源存在缓存头（`Cache-Control: max-age=3600`）。即便已重启成功，浏览器也可能需要强刷（mac：`Cmd+Shift+R`）才能看到新 CSS/JS。

## 2. 文档维护规则
- Canonical：`docs/ai/AI_CONTEXT.md` 是 AI 入口；`docs/README.md` 是 docs 索引。
- 入口文件（例如 `CLAUDE.md`、`WINDSURF.md`、`CURSOR.md`）只允许写“跳转指引”，不要复制规则，避免漂移。
- 迁移文档时：旧路径保留 stub（短重定向），避免断链。

## 3. 数据库变更（Schema）Checklist

当你要增加表/字段/索引时，至少要检查并同步：

- **news.db（日库）**：更新 `hotnews/storage/schema.sql`（并确认 `hotnews/storage/local.py` / `hotnews/storage/remote.py` 使用该 schema 初始化）。
- **online.db（RSS）**：更新 `hotnews/web/db_online.py` 的建表 SQL；如需兼容旧库，加 `_ensure_column(...)`（仅适合 ADD COLUMN 这类简单迁移）。
- **user.db**：更新 `hotnews/web/user_db.py` 的建表 SQL；如需兼容旧库，建议采用“新增列/新表”的方式，避免复杂迁移。
- **fts_index.db（搜索索引）**：更新 `hotnews/search/fts_index.py` 的 FTS 虚拟表定义（必要时需要重建索引）。

一般不需要也不建议提交 `.db` 文件；用初始化/迁移代码保证旧库可升级。

## 4. 大改 Git 工作流（feature 分支 + 验证后合并）

当变更满足任一条件时，视为“大改”：涉及多个模块/目录、涉及数据库 schema、影响线上行为、或需要 OpenSpec proposal。

- 在开始实现前：从 `main` 拉出 `feature/<topic>` 分支。
- 在合并到 `main` 前：
  - 必须完成自测与关键验证（例如前端变更需跑 `npm test`）。
  - 如属于 OpenSpec 范畴：必须先完成 proposal 并获得批准。
- 合并策略：优先走 PR/MR（便于 review 与回滚），确认无误再合并。

## 5. 防误删与可恢复性规则（强制）

当 AI/脚本可能产生“大范围改动”（例如批量删除/移动文件、重写文档、重构多目录）时，必须满足：

- **禁止直接在 `main` 上做大改**：必须在 `feature/<topic>` 分支操作。
- **改动前必须做可回滚点（checkpoint）**：
  - 在开始大改前先提交一次“checkpoint commit”（即便只是当前状态的保存），确保随时可回滚。
- **大范围删除/移动前必须 review diff**：
  - 必须先检查变更范围（例如“哪些文件会被删/被改/被移动”），确认无误后才执行。
- **任何删除都要能恢复**：
  - 删除/移动文件后必须确保可以用 Git 回滚（例如 `git restore` / `git revert` / `git reset --hard <sha>` 等方式恢复）。

建议（非强制，但推荐）：

- **开启 GitHub 分支保护**：要求 PR review + 必须通过 CI（例如 Playwright E2E）后才能合并到 `main`。
- **遇到误删的标准恢复路径**：优先通过 Git 回滚恢复（以 commit 为准），不要靠“手工从服务器拷回”。

## 6. 提交建议（降低多模型协作成本）
- Commit message 尽量写清：范围 + 行为变化 + 关键文件。
- 对关键决策建议在 `docs/ai/AI_CONTEXT.md` 的“最近变更”里追加一条。

## 7. 快速定位
- 配置加载：`hotnews/core/loader.py`（默认 `config/config.yaml`）
- Viewer 指南：`docs/guides/viewer.md`
- RSS AI 分类：`docs/guides/rss-ai-classification.md`
