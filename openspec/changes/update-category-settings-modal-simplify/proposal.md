# Change: Simplify Category Settings Modal

## Why
栏目设置弹窗目前信息密度偏高且占用高度较大：
- 顶部“📋 栏目管理”标题属于冗余信息，可移除以减少视觉干扰。
- “一键开闭”属于全局批量操作，当前需求希望删除该入口，避免误触并简化界面。
- 弹窗顶部标题栏（紫色 header）占用过大，且整体弹窗高度偏高（占用屏幕比例大），影响阅读主页面。
- 打开栏目设置时希望默认收起栏目列表，优先聚焦在“新增/编辑栏目”区域。

## What Changes
- 移除栏目设置弹窗中的“📋 栏目管理”文案。
- 移除栏目设置弹窗中的“一键开闭”开关与文字。
- 调整栏目设置弹窗高度：
  - 降低弹窗顶部标题栏（header）的高度/内边距，避免头部占用过多空间。
- 打开栏目设置时，栏目列表默认处于“收起”状态。

## Impact
- Affected specs:
  - `viewer-categories`（仅 UI/UX 简化，不改变功能语义与配置结构）
- Affected code:
  - `hotnews/web/templates/viewer.html`（弹窗标题与“一键开闭”区域）
  - `hotnews/web/static/css/viewer.css`（弹窗 max-height / 布局）
  - `hotnews/web/static/js/src/settings.js`（打开弹窗时默认折叠状态）
  - `tests/e2e/category-settings.spec.ts`（可能需要更新选择器/断言）

## Risks
- UI 结构调整可能导致 Playwright 选择器失效，需要同步更新测试并确保 `npm test` 全部通过。
