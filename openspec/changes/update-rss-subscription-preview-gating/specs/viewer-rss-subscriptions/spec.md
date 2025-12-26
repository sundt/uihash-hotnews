## ADDED Requirements

### Requirement: RSS 订阅新增门禁（预览 entries>0 才可添加/保存）
系统 SHALL 在 RSS 订阅弹窗中对新增订阅操作提供引导式门禁：
- 未完成预览校验的源不得被添加为订阅。
- 未添加订阅时不得执行保存并刷新。

#### Scenario: 未预览时不得加入待保存订阅列表
- **WHEN** 用户在 RSS 源库中选择了某个 RSS 源
- **AND WHEN** 用户尚未点击「预览」或预览未成功返回 entries>0
- **THEN** 系统 MUST NOT 将该源加入待保存订阅列表

#### Scenario: 预览 entries>0 后自动加入待保存订阅列表
- **WHEN** 用户选择某个 RSS 源并点击「预览」
- **AND WHEN** 预览成功返回 `entries_count > 0`
- **THEN** 系统 MUST 自动将该源加入待保存订阅列表

#### Scenario: 未添加订阅时不可保存并刷新
- **WHEN** 用户打开 RSS 订阅弹窗
- **AND WHEN** 当前订阅列表相对打开时快照没有发生变更
- **THEN** 「保存并刷新」按钮 MUST 处于不可点击状态

#### Scenario: 添加了订阅且满足门禁后可保存并刷新
- **WHEN** 用户通过预览 entries>0 添加了至少一个订阅
- **AND WHEN** 所有“本次新增订阅源”都满足预览 entries>0
- **THEN** 「保存并刷新」按钮 MUST 变为可点击
- **AND THEN** 用户点击后系统 MUST 执行保存，并触发刷新流程

#### Scenario: 预览返回 entries=0 时提示并保持门禁
- **WHEN** 用户点击「预览」且预览请求成功
- **AND WHEN** 预览返回 `entries_count == 0`
- **THEN** 系统 MUST 提示用户“该源暂无条目/请稍后重试”等信息
- **AND THEN** 系统 MUST NOT 将该源加入待保存订阅列表

#### Scenario: 同一次会话中可预览并加入多个待保存订阅
- **WHEN** 用户在同一次打开 RSS 订阅弹窗的会话中依次选择多个 RSS 源并分别点击「预览」
- **AND WHEN** 每个预览均返回 `entries_count > 0`
- **THEN** 系统 MUST 将这些源逐个加入待保存订阅列表
