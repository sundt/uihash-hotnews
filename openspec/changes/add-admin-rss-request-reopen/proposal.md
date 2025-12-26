# Change: Admin 可将已拒绝的 RSS Source Request 重新置为待审核（rejected -> pending）

## Why

- RSS 源申请在被 Reject 后，如果后续 URL 修复/可用性恢复，当前没有操作入口把同一条 request 重新放回待审核队列。
- 运营/管理员需要一个轻量、可追溯的方式把 **已拒绝** 的 request 重新回到 pending，便于再次审核。

## What Changes

- 新增 admin-only API：将 `rss_source_requests` 中 **status=rejected** 的记录重置为 `pending`。
- 在 `/admin/rss-sources` 增加一个 "Rejected Requests" 列表区块，并提供 "Reopen" 按钮。

### Reopen 行为约束

- 仅允许 `rejected -> pending`。
- 不允许对 `approved` 执行 reopen。
- reopen 不联动修改 `rss_sources`（仅操作 request 状态字段）。

## Impact

- Affected specs:
  - `rss-source-catalog`
- Affected code:
  - `trendradar/web/rss_admin.py`
  - `trendradar/web/templates/admin_rss_sources.html`

## Non-Goals

- 不提供批量 reopen。
- 不提供从 `approved` 回退到 `pending`。
- 不做更复杂的筛选/搜索 UI（仅提供一个被拒绝列表 + reopen 按钮）。

## Risks

- 误操作导致已拒绝 request 回到 pending：
  - UI 上应清晰展示当前状态，并在操作失败时提示原因。

## Acceptance Criteria

- 管理员可以在 `/admin/rss-sources` 页面看到最近的 rejected requests，并可将某条 rejected request 重新置为 pending。
- 该操作必须受 admin-token 保护。
- 被 reopen 的记录会出现在 Pending Requests 列表中，并可继续走 approve/reject 流程。
