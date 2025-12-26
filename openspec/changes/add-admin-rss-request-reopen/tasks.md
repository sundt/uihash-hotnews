## 1. Backend

- [ ] 1.1 新增 admin-only API：`POST /api/admin/rss-source-requests/{request_id}/reopen`
  - [ ] 仅当 request.status == `rejected` 时允许
  - [ ] 状态更新：`status='pending'`, `reason=''`, `reviewed_at=0`
  - [ ] 返回 `{ ok: true }`

## 2. Admin UI

- [ ] 2.1 `/admin/rss-sources` 页面新增 "Rejected Requests" 区块（显示最近 N 条）
- [ ] 2.2 每条 rejected request 增加 "Reopen" 按钮
  - [ ] 调用 `POST /api/admin/rss-source-requests/{id}/reopen`
  - [ ] 成功后 `location.reload()`

## 3. Verification

- [ ] 3.1 手工验证：rejected request -> reopen -> 出现在 pending -> 可 approve/reject
- [ ] 3.2 确认：approved request 调用 reopen 会被拒绝（400）
