# Tasks: Update Category Settings UX

## 1. Proposal Artifacts
- [x] 1.1 更新 `proposal.md` 明确 UX 约束（方案 A：尽量一屏展示平台，极端情况下允许少量滚动）
- [x] 1.2 编写 `specs/viewer-categories/spec.md`（仅 UX 相关 MODIFIED Requirements，不改变功能语义）
- [x] 1.3 （如需要）补充 `design.md` 描述布局结构与选择器稳定性策略

## 2. UI/UX Implementation (after approval)
- [x] 2.1 重构栏目设置弹窗布局（默认栏目区折叠/缩小占位，自定义相关更突出）
- [x] 2.2 平台选择区改为多列网格布局（CSS grid / auto-fit），尽量减少滚动
- [x] 2.3 增加平台快速筛选（搜索框）
- [x] 2.4 增加平台批量操作（全选/全不选/清空）
- [x] 2.5 保持平台拖拽排序能力与现有数据结构不变

## 3. E2E Tests & Stability (after approval)
- [x] 3.1 更新 `tests/e2e/pages/viewer.page.ts`（如选择器变化）
- [x] 3.2 更新 `tests/e2e/category-settings.spec.ts`，确保覆盖关键流程且不依赖脆弱 DOM
- [x] 3.3 运行 `npm test` 并修复所有失败

## 4. Validation
- [x] 4.1 运行 `openspec validate update-category-settings-ux --strict` 并修复问题
