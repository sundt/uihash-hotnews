# Requirements Document

## Introduction

本功能在 Hotnews 新闻聚合系统的设置页面新增"公众号"Tab，让用户可以通过自己的微信公众号账号授权，搜索并订阅感兴趣的公众号，系统定时抓取文章列表并展示在"我的关注"中。

微信公众号是中文互联网重要的内容来源，但没有官方 RSS 支持。本功能利用微信公众号后台的 API 接口，让用户能够在 Hotnews 中统一管理和阅读公众号文章。

## Glossary

- **Settings_Page**: 用户设置页面，位于 `/user/settings`
- **WeChat_MP_Tab**: 设置页面中的"公众号"标签页
- **Auth_Info**: 用户的微信公众号认证信息，包含 Cookie 和 Token
- **Cookie**: 微信公众号后台的会话凭证，有效期约 2-4 小时
- **Token**: 微信公众号后台的请求令牌，与 Cookie 配合使用
- **Fakeid**: 公众号的唯一标识符，用于获取文章列表
- **MP_Account**: 微信公众号账号（订阅号或服务号）
- **Subscription**: 用户订阅的公众号记录
- **Article_Cache**: 公众号文章的本地缓存
- **WeChat_Provider**: 负责调用微信 API 的后端模块
- **Following_List**: 用户关注的内容列表，包含标签和订阅源

## Requirements

### Requirement 1: 认证信息管理

**User Story:** 作为用户，我希望能够配置我的微信公众号认证信息，以便系统能够代我获取公众号文章。

#### Acceptance Criteria

1. WHEN 用户访问 WeChat_MP_Tab, THE Settings_Page SHALL 显示认证状态区域，包含当前状态和操作按钮
2. WHEN 用户未配置 Auth_Info, THE Settings_Page SHALL 显示"未认证"状态和"配置认证"按钮
3. WHEN 用户已配置 Auth_Info 且有效, THE Settings_Page SHALL 显示"已认证"状态和预估剩余有效时间
4. WHEN 用户已配置 Auth_Info 但已过期, THE Settings_Page SHALL 显示"已过期"状态和"更新认证"按钮
5. WHEN 用户点击"配置认证"或"更新认证"按钮, THE Settings_Page SHALL 显示认证配置弹窗
6. WHEN 认证配置弹窗显示时, THE Settings_Page SHALL 展示获取 Cookie/Token 的操作指南
7. WHEN 用户提交 Cookie 和 Token, THE WeChat_Provider SHALL 验证认证信息的有效性
8. IF 认证信息验证失败, THEN THE Settings_Page SHALL 显示错误信息并保持弹窗打开
9. WHEN 认证信息验证成功, THE Settings_Page SHALL 保存认证信息并更新状态显示

### Requirement 2: 公众号搜索

**User Story:** 作为用户，我希望能够搜索公众号，以便找到我想要订阅的内容来源。

#### Acceptance Criteria

1. WHEN 用户已配置有效的 Auth_Info, THE WeChat_MP_Tab SHALL 显示公众号搜索输入框
2. WHEN 用户未配置有效的 Auth_Info, THE WeChat_MP_Tab SHALL 禁用搜索功能并提示需要先配置认证
3. WHEN 用户输入至少 2 个字符的搜索关键词, THE WeChat_Provider SHALL 调用微信搜索 API 查询公众号
4. THE WeChat_MP_Tab SHALL 对搜索输入进行 500ms 防抖处理，避免频繁请求
5. WHEN 搜索返回结果, THE WeChat_MP_Tab SHALL 显示公众号列表，包含头像、名称和简介
6. WHEN 搜索无结果, THE WeChat_MP_Tab SHALL 显示"未找到相关公众号"提示
7. IF 搜索请求失败（如认证过期）, THEN THE WeChat_MP_Tab SHALL 显示错误信息并提示更新认证
8. IF 搜索触发频率限制, THEN THE WeChat_MP_Tab SHALL 显示"请求过于频繁，请稍后再试"提示

### Requirement 3: 公众号订阅管理

**User Story:** 作为用户，我希望能够订阅和取消订阅公众号，以便管理我关注的内容来源。

#### Acceptance Criteria

1. WHEN 搜索结果中的公众号未被订阅, THE WeChat_MP_Tab SHALL 显示"订阅"按钮
2. WHEN 搜索结果中的公众号已被订阅, THE WeChat_MP_Tab SHALL 显示"已订阅"状态
3. WHEN 用户点击"订阅"按钮, THE Settings_Page SHALL 立即更新 UI（乐观更新）并调用订阅 API
4. IF 订阅 API 调用失败, THEN THE Settings_Page SHALL 回滚 UI 状态并显示错误信息
5. WHEN 订阅成功, THE Subscription SHALL 被保存到数据库，包含 fakeid、名称、头像和简介
6. THE WeChat_MP_Tab SHALL 显示已订阅公众号列表，每项包含头像、名称和取消订阅按钮
7. WHEN 用户点击取消订阅按钮, THE Settings_Page SHALL 立即更新 UI 并调用取消订阅 API
8. IF 取消订阅 API 调用失败, THEN THE Settings_Page SHALL 回滚 UI 状态并显示错误信息

### Requirement 4: 文章抓取与缓存

**User Story:** 作为用户，我希望系统能够自动获取我订阅的公众号文章，以便我能及时阅读最新内容。

#### Acceptance Criteria

1. THE WeChat_Provider SHALL 定时抓取所有用户订阅的公众号文章（每个公众号每 30 分钟一次）
2. WHEN 抓取文章时, THE WeChat_Provider SHALL 控制请求间隔（每次请求间隔至少 2 秒）
3. THE Article_Cache SHALL 存储文章的标题、链接、发布时间、摘要和封面图
4. WHEN 抓取到新文章, THE WeChat_Provider SHALL 根据文章链接去重，避免重复存储
5. IF 用户的 Auth_Info 已过期, THEN THE WeChat_Provider SHALL 跳过该用户的抓取任务并记录日志
6. WHEN 多个用户订阅同一公众号, THE Article_Cache SHALL 共享文章数据，避免重复抓取
7. THE WeChat_Provider SHALL 记录每次抓取的结果（成功/失败/跳过）用于问题排查

### Requirement 5: 文章展示

**User Story:** 作为用户，我希望在首页看到我订阅的公众号文章，以便统一阅读所有关注的内容。

#### Acceptance Criteria

1. WHEN 用户访问首页的"我的关注"区域, THE Following_List SHALL 包含用户订阅的公众号文章
2. THE Article_Cache 中的文章 SHALL 按发布时间倒序排列
3. WHEN 显示公众号文章, THE Following_List SHALL 展示微信图标标识以区分来源类型
4. WHEN 用户点击文章, THE Settings_Page SHALL 在新标签页打开微信文章原文链接
5. THE Following_List SHALL 支持按来源类型过滤，允许用户只查看公众号文章

### Requirement 6: 认证过期提醒

**User Story:** 作为用户，我希望在认证即将过期或已过期时收到提醒，以便及时更新认证信息。

#### Acceptance Criteria

1. WHEN 用户的 Auth_Info 剩余有效时间少于 30 分钟, THE Settings_Page SHALL 在 WeChat_MP_Tab 显示警告提示
2. WHEN 用户的 Auth_Info 已过期, THE Settings_Page SHALL 在 WeChat_MP_Tab 显示醒目的过期提示
3. WHEN 用户访问首页且 Auth_Info 已过期, THE Following_List SHALL 显示提示信息引导用户更新认证
4. THE 过期提示 SHALL 包含快捷链接，点击可直接跳转到认证配置页面

### Requirement 7: 数据持久化

**User Story:** 作为系统管理员，我希望用户数据能够安全持久化存储，以便系统重启后数据不丢失。

#### Acceptance Criteria

1. THE Auth_Info SHALL 存储在 wechat_mp_auth 表中，每个用户一条记录
2. THE Subscription SHALL 存储在 wechat_mp_subscriptions 表中，支持用户订阅多个公众号
3. THE Article_Cache SHALL 存储在 wechat_mp_articles 表中，按 fakeid 和发布时间索引
4. WHEN 用户删除账号, THE 系统 SHALL 级联删除该用户的所有微信相关数据
5. THE Cookie 和 Token SHALL 加密存储，不以明文形式保存在数据库中

### Requirement 8: 错误处理与日志

**User Story:** 作为系统管理员，我希望系统能够妥善处理各种错误情况，以便快速定位和解决问题。

#### Acceptance Criteria

1. IF 微信 API 返回错误码 200003（认证过期）, THEN THE WeChat_Provider SHALL 将用户的 Auth_Info 状态标记为 expired
2. IF 微信 API 返回错误码 200013（频率限制）, THEN THE WeChat_Provider SHALL 暂停该用户的请求 5 分钟
3. IF 网络请求超时, THEN THE WeChat_Provider SHALL 重试最多 3 次，每次间隔递增
4. THE WeChat_Provider SHALL 记录所有 API 调用的请求参数、响应状态和耗时
5. WHEN 发生异常, THE WeChat_Provider SHALL 记录完整的错误堆栈信息

