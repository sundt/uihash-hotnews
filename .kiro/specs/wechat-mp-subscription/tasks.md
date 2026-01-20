# Implementation Plan: 微信公众号订阅功能

## Overview

本实现计划将微信公众号订阅功能分为数据库、后端 Provider、API 接口、定时任务和前端 UI 五个主要部分，按照依赖关系逐步实现。

## Tasks

- [x] 1. 数据库表和模型
  - [x] 1.1 创建 wechat_mp_auth 表
    - 添加 user_id、cookie_encrypted、token、status、expires_at 等字段
    - 添加外键约束和唯一索引
    - _Requirements: 7.1, 7.5_
  
  - [x] 1.2 创建 wechat_mp_subscriptions 表
    - 添加 user_id、fakeid、nickname、round_head_img、signature 等字段
    - 添加 (user_id, fakeid) 唯一约束
    - _Requirements: 7.2_
  
  - [x] 1.3 创建 wechat_mp_articles 表（存储在 online.db）
    - 添加 fakeid、dedup_key、title、url、digest、cover_url、publish_time 等字段
    - 添加 url 唯一约束用于去重
    - 添加 (fakeid, dedup_key) 唯一约束用于关联 rss_entry_tags
    - 添加 (fakeid, publish_time DESC) 索引
    - _Requirements: 7.3, 4.4_
  
  - [x] 1.4 实现 Cookie 加密/解密工具函数
    - 使用 Fernet 对称加密
    - 实现 encrypt_cookie() 和 decrypt_cookie()
    - _Requirements: 7.5_
  
  - [ ]* 1.5 编写属性测试：加密存储往返
    - **Property 22: 加密存储**
    - **Validates: Requirements 7.5**

- [x] 2. 检查点 - 数据库层完成
  - 确保所有表创建成功，运行迁移脚本
  - 确保加密函数测试通过

- [x] 3. WeChat Provider 核心实现
  - [x] 3.1 创建 `hotnews/kernel/providers/wechat_provider.py`
    - 实现 WeChatMPProvider 类基础结构
    - 配置请求头和基础 URL
    - _Requirements: 2.3, 4.2_
  
  - [x] 3.2 实现 test_auth() 方法
    - 调用微信 API 验证 Cookie/Token 有效性
    - 返回验证结果和错误信息
    - _Requirements: 1.7_
  
  - [x] 3.3 实现 search_mp() 方法
    - 调用 searchbiz API 搜索公众号
    - 解析响应并返回公众号列表
    - 处理错误码 200003、200013
    - _Requirements: 2.3, 8.1, 8.2_
  
  - [x] 3.4 实现 get_articles() 方法
    - 调用 appmsgpublish API 获取文章列表
    - 解析嵌套的 JSON 响应结构
    - 提取 title、url、digest、cover、publish_time
    - _Requirements: 4.3_
  
  - [x] 3.5 实现请求间隔控制
    - 添加请求时间戳记录
    - 确保相邻请求间隔 >= 2 秒
    - _Requirements: 4.2_
  
  - [x] 3.6 实现重试逻辑
    - 网络超时时重试最多 3 次
    - 重试间隔递增（1s, 2s, 4s）
    - _Requirements: 8.3_
  
  - [ ]* 3.7 编写属性测试：请求间隔控制
    - **Property 11: 请求间隔控制**
    - **Validates: Requirements 4.2**
  
  - [ ]* 3.8 编写属性测试：错误码处理
    - **Property 23: 错误码处理**
    - **Validates: Requirements 8.1, 8.2**

- [x] 4. 检查点 - Provider 核心完成
  - 确保 Provider 方法可以正常调用微信 API
  - 确保错误处理逻辑正确

- [x] 5. 后端 API 接口
  - [x] 5.1 创建 `hotnews/kernel/admin/wechat_admin.py`
    - 定义路由前缀 /api/wechat
    - 添加用户认证中间件
    - _Requirements: 1.1_
  
  - [x] 5.2 实现认证管理 API
    - POST /api/wechat/auth - 保存认证信息（加密存储）
    - GET /api/wechat/auth/status - 获取认证状态
    - POST /api/wechat/auth/test - 测试认证有效性
    - _Requirements: 1.7, 1.9_
  
  - [x] 5.3 实现公众号搜索 API
    - GET /api/wechat/search?keyword=xxx
    - 调用 Provider.search_mp()
    - 标记已订阅的公众号
    - _Requirements: 2.3, 3.1, 3.2_
  
  - [x] 5.4 实现订阅管理 API
    - POST /api/wechat/subscribe - 订阅公众号
    - POST /api/wechat/unsubscribe - 取消订阅
    - GET /api/wechat/subscriptions - 获取订阅列表
    - _Requirements: 3.5, 3.6_
  
  - [x] 5.5 实现文章获取 API
    - GET /api/wechat/articles - 获取用户订阅的所有文章
    - 支持分页和时间范围过滤
    - 按发布时间倒序排列
    - _Requirements: 5.1, 5.2_
  
  - [x] 5.6 在 server.py 中注册路由
    - 导入 wechat_admin 模块
    - 注册 /api/wechat 路由组
    - _Requirements: 1.1_
  
  - [ ]* 5.7 编写属性测试：文章时间排序
    - **Property 17: 文章时间排序**
    - **Validates: Requirements 5.2**
  
  - [ ]* 5.8 编写属性测试：订阅数据持久化
    - **Property 9: 订阅数据持久化**
    - **Validates: Requirements 3.5**

- [x] 6. 检查点 - API 接口完成
  - 确保所有 API 端点可以正常访问
  - 使用 curl 或 Postman 测试各接口

- [x] 7. 定时任务实现
  - [x] 7.1 创建 `hotnews/kernel/scheduler/wechat_scheduler.py`
    - 实现 WeChatArticleScheduler 类
    - 配置抓取间隔（每公众号 30 分钟）
    - _Requirements: 4.1_
  
  - [x] 7.2 实现用户遍历逻辑
    - 获取所有有效认证的用户
    - 跳过过期认证的用户
    - _Requirements: 4.5_
  
  - [x] 7.3 实现文章抓取和存储
    - 遍历用户订阅的公众号
    - 调用 Provider.get_articles()
    - 生成 dedup_key = md5(url)
    - 根据 URL 去重后存储到 wechat_mp_articles
    - _Requirements: 4.3, 4.4, 4.6_
  
  - [ ] 7.4 集成 AI 标签分类
    - 新文章入库后调用 AI 分类
    - 使用 source_id = 'wechat-{fakeid}' 格式
    - 写入 rss_entry_tags 表（复用现有逻辑）
    - _Requirements: 4.3_
  
  - [x] 7.5 注册定时任务
    - 在应用启动时注册调度器
    - 配置运行间隔
    - _Requirements: 4.1_
  
  - [ ]* 7.6 编写属性测试：文章去重
    - **Property 13: 文章链接去重**
    - **Validates: Requirements 4.4**
  
  - [ ]* 7.7 编写属性测试：过期用户跳过
    - **Property 14: 过期用户跳过**
    - **Validates: Requirements 4.5**

- [x] 8. 检查点 - 后端完成
  - 确保定时任务可以正常运行
  - 确保文章抓取和存储逻辑正确

- [x] 9. 前端 UI 实现
  - [x] 9.1 在设置页面添加"公众号"Tab
    - 修改 user_settings.html 模板
    - 添加 Tab 切换逻辑
    - _Requirements: 1.1_
  
  - [x] 9.2 实现认证状态区域
    - 显示当前认证状态（未认证/已认证/已过期）
    - 显示剩余有效时间
    - 添加配置/更新按钮
    - _Requirements: 1.2, 1.3, 1.4, 6.1, 6.2_
  
  - [x] 9.3 实现认证配置弹窗
    - Cookie/Token 输入表单
    - 获取认证信息的操作指南
    - 验证和保存逻辑
    - _Requirements: 1.5, 1.6, 1.8, 1.9_
  
  - [x] 9.4 实现公众号搜索功能
    - 搜索输入框（带防抖）
    - 搜索结果列表渲染
    - 订阅状态显示
    - _Requirements: 2.1, 2.2, 2.4, 2.5, 2.6_
  
  - [x] 9.5 实现订阅管理功能
    - 订阅/取消订阅按钮
    - 乐观更新 UI
    - 失败回滚逻辑
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.7, 3.8_
  
  - [x] 9.6 实现已订阅列表
    - 显示已订阅的公众号
    - 头像、名称、取消订阅按钮
    - _Requirements: 3.6_
  
  - [ ]* 9.7 编写属性测试：认证状态渲染
    - **Property 1: 认证状态渲染一致性**
    - **Validates: Requirements 1.2, 1.3, 1.4**
  
  - [ ]* 9.8 编写属性测试：搜索防抖
    - **Property 4: 搜索防抖行为**
    - **Validates: Requirements 2.4**
  
  - [ ]* 9.9 编写属性测试：订阅按钮状态
    - **Property 6: 订阅按钮状态对应**
    - **Validates: Requirements 3.1, 3.2**
  
  - [ ]* 9.10 编写属性测试：乐观更新
    - **Property 7: 订阅操作乐观更新**
    - **Validates: Requirements 3.3, 3.7**

- [x] 10. 检查点 - 前端 UI 完成
  - 确保所有 UI 组件正常渲染
  - 确保交互逻辑正确

- [x] 11. 首页文章展示集成
  - [x] 11.1 修改 preferences_api.py 的 get_followed_news
    - 在"我的关注"区域包含公众号文章（Part 4）
    - 查询 wechat_mp_articles JOIN rss_entry_tags
    - 添加 source_type='wechat' 标识
    - _Requirements: 5.1, 5.3_
  
  - [x] 11.2 修改按标签查询逻辑
    - UNION rss_entries 和 wechat_mp_articles
    - 通过 rss_entry_tags 关联标签
    - 统一排序后返回
    - _Requirements: 5.1, 5.2_
  
  - [x] 11.3 实现来源类型过滤
    - 添加"只看公众号"过滤选项
    - 实现过滤逻辑
    - _Requirements: 5.5_
  
  - [x] 11.4 实现认证过期提醒
    - 在首页显示过期提示
    - 添加跳转到设置页面的链接
    - _Requirements: 6.3, 6.4_
  
  - [ ]* 11.5 编写属性测试：来源类型过滤
    - **Property 19: 来源类型过滤**
    - **Validates: Requirements 5.5**

- [x] 12. 最终检查点
  - 确保所有测试通过
  - 确保端到端流程正常工作
  - 如有问题请询问用户

## Notes

- 标记 `*` 的任务为可选测试任务，可跳过以加快 MVP 开发
- 每个任务都引用了具体的需求条款以便追溯
- 检查点用于确保增量验证
- 属性测试验证设计文档中定义的正确性属性

