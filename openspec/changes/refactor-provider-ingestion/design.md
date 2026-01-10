## Context
Hotnews 现有抓取链路主要围绕 NewsNow 聚合源与 `DataFetcher` 组织。
NBA 当前实现位于 `hotnews/web/server.py`，以 Web 请求触发抓取并注入 `sports` 分类；这不利于扩展更多“爬虫/外部源”，且抓取频率不可控。

财新等媒体站点只需要“标题 + 链接”，属于典型 RSS/HTML 列表抓取场景，适合定时落库。

## Goals / Non-Goals
- Goals:
  - 统一 Provider 接入：新增平台不改 Web 层，只新增 provider + 配置
  - 定时落库：抓取从“请求触发”迁移到“后台调度”
  - 统一 metrics：与现有 `/api/fetch-metrics` 输出口径一致
  - 支持 RSS/HTML 站点源（财新：标题+链接）
- Non-Goals:
  - 不抓取财新全文（避免付费墙/登录复杂度）
  - 不引入重量级 headless 浏览器作为默认方案

## Decisions
- Decision: 抽象 Provider 接口，返回统一的 `news item` 列表与抓取 meta。
- Decision: 引入 Provider Registry（静态注册或配置驱动），并在 config 中声明平台映射。
- Decision: 抓取调度由后台任务承担，viewer 只读取落库结果；必要时提供手动刷新触发，但采用异步执行。
- Decision: 站点类 provider 采用 RSS-first + HTML fallback。

## Risks / Trade-offs
- 风险：RSS URL/规则变动 → Mitigation：配置化 + fallback + 快速热修复
- 风险：HTML 解析易受页面结构变化影响 → Mitigation：解析尽量只依赖稳定选择器/链接结构，失败降级不影响其他平台
- Trade-off：从请求触发迁移到后台落库会引入“数据延迟” → Mitigation：合理的抓取间隔 + 手动刷新入口

## Migration Plan
- Phase 1: 引入 Provider 抽象与 registry，但保持现有链路不变。
- Phase 2: 将 NBA 从 web 层迁移至 provider + 定时落库；web 层只读。
- Phase 3: 增加 Caixin provider（RSS/HTML），纳入调度与展示。
- Rollback: 配置禁用新 provider；或暂时恢复 web 注入逻辑（不推荐，仅用于紧急回滚）。

## Open Questions
- Provider 输出的 `timestamp` 语义：站点类源通常没有精确时间，是否允许为空/使用抓取时间作为 fallback。
- 去重键：标题+链接（推荐） vs 仅链接。
