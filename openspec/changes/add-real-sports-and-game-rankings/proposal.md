# Change: 引入真实 NBA 排行与游戏排行数据源（非 NewsNow 聚合）

## Why
当前 Hotnews 的抓取链路依赖 NewsNow 聚合 API（`newsnow.busiyi.world/api/s?id=...`），这类源偏“热点/热榜/聚合”，并不能覆盖你需要的 **真实 NBA 赛事/排名** 与 **真实游戏平台排行**（例如 Steam 热销榜/热门榜/在线榜等）。

为了满足“真实 + 可持续抓取”的需求，需要新增一条独立于 NewsNow 的数据源通道，并将其纳入现有存储与 viewer 展示链路。

## What Changes
- 新增 **Sports 数据源适配器**：抓取 NBA **当日赛程 + 比分（scoreboard）**，并转换为 Hotnews 统一新闻结构
- 新增 **Game 排行数据源适配器**：抓取 Steam **New & Trending（新作热度）** 榜单，并转换为 Hotnews 统一新闻结构
- 在 `config/config.yaml` 提供配置项选择数据提供方、抓取频率、区域/语言、API Key（如需要）
- 失败时降级：不影响现有 NewsNow 平台抓取；新增源失败只标记为失败平台

## Recommended Providers (Draft)
### NBA（当日赛程 + 比分 / scoreboard）
- **Option A（推荐）: BALLDONTLIE API**
  - 方向：使用 `games` 相关 endpoint，以日期参数获取“今日所有比赛 + 状态 + 主客队比分”。
  - 优点：结构化数据、无需反爬处理、适合 server 稳定跑。
  - 风险：Key/额度、条款变化（需要确认免费档能力）。
- **Option B: TheSportsDB**
  - 方向：使用 `eventsday` 等 endpoint，按日期获取 NBA 赛事与比分。
  - 优点：接口简单，可能有免费档。
  - 风险：数据覆盖与更新频率需评估。
- **Option C（备选，不作为首选）: stats.nba.com 非官方接口**
  - 风险：强反爬/需要复杂 headers/cookies，极易不稳定。

### Steam（New & Trending / 新作热度）
- **Option A（推荐）: Steam Store JSON 接口（无需 Steamworks Key）**
  - 方向：优先尝试 Steam Store 的分类/榜单 JSON（例如 `/api/featuredcategories`），从返回分类中提取 New & Trending 对应的数据结构。
  - 优点：无需 Steamworks Key，数据更贴近真实商店展示。
  - 风险：非官方稳定性、字段结构可能变化、地区/语言参数影响。
- **Option B（备选）: Steam 搜索 JSON（无需 Steamworks Key）**
  - 方向：使用 `store.steampowered.com/search/results/` 的 `filter=newandtrending&json=1` 形式获取“新作热度”列表。
  - 风险：属于网页接口，存在限流/结构调整风险。
- **Option C: 第三方数据源**
  - 方向：SteamDB/SteamSpy 等。
  - 风险：可能需要 Key、限额、条款限制；数据口径可能与 Steam 商店榜单不一致。

## Impact
- Affected specs:
  - `specs/sports-game-data/spec.md`（新增 capability：体育/游戏数据源）
- Affected code (expected):
  - `hotnews/crawler/`（新增 provider fetcher + adapter）
  - `hotnews/web/server.py`（viewer auto_fetch 时纳入新源）
  - `config/config.yaml`（新增配置项）

## Scope (Confirmed)
- NBA: **当日赛程 + 比分（scoreboard）**
- Steam: **New & Trending（新作热度）**

## Open Questions
- BALLDONTLIE 是否必须提供 API Key 才能获取足够稳定/可用的 games 数据？（如果必须，则需要你提供 Key，且不要写入仓库，改走环境变量。）
- Steam New & Trending 的“口径”确认：是否以 Steam 商店同名模块为准（推荐），并以 `cc`/`l` 参数固定地区/语言？
