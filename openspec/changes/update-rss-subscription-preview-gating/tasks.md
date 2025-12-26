## 1. Implementation
- [ ] 1.1 在 `subscription.js` 引入 RSS 预览状态缓存（按 source_id）
- [ ] 1.2 增加按钮门禁逻辑：Preview / Add / Save 的 enable/disable 与提示
- [ ] 1.3 定义“本次新增订阅源”的计算方式（相对 open snapshot）
- [ ] 1.4 更新 UI：不可点击时提供明确原因提示

## 2. Tests
- [ ] 2.1 更新/新增 `tests/e2e/rss-subscriptions.spec.ts` 覆盖门禁流程
- [ ] 2.2 `npm test` 全量通过
