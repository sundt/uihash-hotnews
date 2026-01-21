# 实现计划：RSS 智能调度器

## 概述

本实现计划将 RSS 智能调度器功能分解为可增量执行的编码任务。每个任务都建立在前一个任务的基础上，确保代码始终处于可运行状态。

**改造范围：**
- ✅ RSS 源
- ✅ 自定义源
- ❌ 热源/NewsNow - 保持现状

## 任务列表

- [x] 1. 创建数据库表和智能调度器服务骨架
  - [x] 1.1 在 `hotnews/web/db_online.py` 中添加 `source_stats` 表定义
    - 创建表结构：source_id, source_type, frequency_type, cadence, avg_publish_hour, std_publish_hour, next_due_at, last_check_at, last_article_at, fail_count, backoff_until, last_error, check_count, hit_count, created_at, updated_at
    - 创建索引：idx_source_stats_next_due, idx_source_stats_cadence, idx_source_stats_type, idx_source_stats_type_due
    - _Requirements: 1.1, 1.4_
  
  - [x] 1.2 创建 `hotnews/kernel/services/rss_smart_scheduler.py` 服务骨架
    - 定义节奏配置常量 RSS_CADENCE_INTERVALS 和 FREQUENCY_CADENCE_MAP
    - 定义所有函数签名和文档字符串
    - _Requirements: 8.1_

- [x] 2. 实现频率分类功能
  - [x] 2.1 实现 `classify_update_frequency` 函数
    - 计算最近 20 条条目之间的平均间隔时间
    - 统计每日发布数量
    - 根据阈值返回频率类型和节奏
    - 处理少于 3 条条目的边界情况
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9_
  
  - [ ]* 2.2 编写频率分类属性测试
    - **Property 1: 频率分类一致性**
    - **Validates: Requirements 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8**

- [x] 3. 实现发布时间统计功能
  - [x] 3.1 实现 `calculate_publish_time_stats` 函数
    - 计算最近 30 条条目的平均发布小时
    - 计算发布小时的标准差
    - 将标准差限制在 1.0 到 6.0 范围内
    - 处理少于 3 条条目的边界情况
    - _Requirements: 3.1, 3.2, 3.3, 3.4_
  
  - [ ]* 3.2 编写发布时间统计属性测试
    - **Property 2: 发布时间统计正确性**
    - **Validates: Requirements 3.1, 3.2, 3.3**

- [x] 4. 实现下次检查时间计算
  - [x] 4.1 实现 `calculate_next_check_time` 函数
    - 实现时间预测策略（daily/daily_fixed/weekly 且有发布时间统计）
    - 实现固定间隔策略（带 0.85-1.15 抖动）
    - 确保等待时间不超过基础间隔的 2 倍
    - 确保最大等待时间不超过 24 小时
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_
  
  - [ ]* 4.2 编写下次检查时间属性测试
    - **Property 5: 下次检查时间边界约束**
    - **Property 6: 抖动范围约束**
    - **Validates: Requirements 6.4, 6.5, 6.6**

- [x] 5. 实现退避计算功能
  - [x] 5.1 实现 `calculate_backoff` 函数
    - 识别速率限制错误（429/rate/频繁）→ 6 小时
    - 识别认证过期错误（401/expired/过期）→ 0
    - 识别禁止访问错误（403/forbidden）→ 12 小时
    - 实现指数退避策略，最大 24 小时
    - _Requirements: 7.1, 7.2, 7.3, 7.4_
  
  - [ ]* 5.2 编写退避计算属性测试
    - **Property 7: 退避时间计算正确性**
    - **Validates: Requirements 7.1, 7.2, 7.3, 7.4**

- [x] 6. Checkpoint - 确保所有核心函数测试通过
  - 运行所有属性测试，确保通过
  - 如有问题请询问用户

- [x] 7. 实现统计数据管理功能
  - [x] 7.1 实现 `get_source_stats` 和 `get_recent_entries` 函数
    - 查询 source_stats 表获取源统计
    - 查询 rss_entries 表获取 RSS 源最近条目
    - 支持 source_type 参数区分 RSS 和自定义源
    - _Requirements: 8.8_
  
  - [x] 7.2 实现 `update_source_stats` 函数
    - 创建新记录（首次抓取），包含 source_type 字段
    - 更新现有记录（递增 check_count/hit_count）
    - 触发重分析条件（每 10 次检查或首次命中）
    - 成功时重置 fail_count 和 backoff_until
    - 失败时计算退避时间
    - 更新 updated_at 时间戳
    - _Requirements: 1.2, 1.3, 4.1, 4.2, 5.1, 5.2, 5.3, 7.5_
  
  - [ ]* 7.3 编写统计数据管理属性测试
    - **Property 3: 统计计数器递增正确性**
    - **Property 8: 成功抓取重置状态**
    - **Property 10: 重分析触发条件**
    - **Property 11: 统计记录创建**
    - **Property 12: 时间戳更新**
    - **Validates: Requirements 1.2, 1.3, 4.1, 4.2, 5.1, 5.2, 7.5**

- [x] 8. 实现调度器查询功能
  - [x] 8.1 实现 `get_due_sources` 函数
    - 查询 next_due_at <= now 且 backoff_until <= now 的源
    - 支持 source_type 参数过滤（'rss', 'custom', 或 None）
    - 按 next_due_at 升序排序
    - 支持 limit 参数
    - _Requirements: 8.8_
  
  - [x] 8.2 实现 `get_scheduler_stats` 函数
    - 返回总源数、有统计记录的源数
    - 返回各节奏等级的分布
    - 返回当前到期数、退避中的数量
    - 计算平均命中率
    - 支持按 source_type 分别统计
    - _Requirements: 9.1, 9.2, 9.3, 9.4_
  
  - [ ]* 8.3 编写调度器查询属性测试
    - **Property 4: 命中率计算正确性**
    - **Property 9: 节奏兼容性**
    - **Validates: Requirements 4.3, 4.4, 5.4, 9.2, 9.3**

- [x] 9. Checkpoint - 确保智能调度器服务完整
  - 运行所有属性测试，确保通过
  - 如有问题请询问用户

- [x] 10. 集成到现有调度器
  - [x] 10.1 修改 `_rss_warmup_producer_loop` 集成智能调度
    - 导入 rss_smart_scheduler 模块
    - 优先使用 get_due_sources(source_type="rss") 获取到期源
    - 保留现有逻辑作为后备
    - _Requirements: 8.2, 8.3_
  
  - [x] 10.2 修改 `_rss_process_warmup_one` 更新统计数据
    - 抓取完成后调用 update_source_stats(source_type="rss")
    - 使用智能调度器计算的 next_due_at 更新 rss_sources 表
    - _Requirements: 8.4_
  
  - [x] 10.3 修改 `_custom_ingest_loop` 集成智能调度
    - 导入 rss_smart_scheduler 模块
    - 优先使用 get_due_sources(source_type="custom") 获取到期源
    - 抓取完成后调用 update_source_stats(source_type="custom")
    - 使用智能调度器计算的 next_due_at 更新 custom_sources 表
    - 保留现有逻辑作为后备
    - _Requirements: 8.5, 8.6, 8.7_
  
  - [ ]* 10.4 编写集成测试
    - 验证 RSS 源智能调度器可用时使用智能调度
    - 验证 RSS 源智能调度器不可用时回退到固定间隔
    - 验证自定义源智能调度器可用时使用智能调度
    - 验证自定义源智能调度器不可用时回退到固定间隔
    - _Requirements: 8.2, 8.3, 8.4, 8.5, 8.6, 8.7_

- [x] 11. 最终 Checkpoint - 确保所有测试通过
  - 运行所有单元测试和属性测试
  - 运行集成测试
  - 如有问题请询问用户

## 备注

- 标记 `*` 的任务为可选任务，可跳过以加快 MVP 开发
- 每个任务都引用了具体的需求以确保可追溯性
- Checkpoint 任务用于确保增量验证
- 属性测试验证通用正确性属性
- 单元测试验证特定示例和边界条件
