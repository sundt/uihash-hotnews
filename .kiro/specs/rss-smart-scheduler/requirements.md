# 需求文档

## 简介

RSS 智能调度器功能旨在将当前固定间隔的 RSS 源和自定义源调度机制升级为基于历史更新模式的自适应智能调度。该功能参考已实现的微信公众号智能调度器（`wechat_smart_scheduler.py`），为 RSS 源和自定义源提供：
- 基于历史条目的更新频率自动分类
- 基于统计分析的发布时间预测
- 命中率追踪（有新内容的抓取次数 / 总抓取次数）
- 基于实际更新频率的自动节奏调整

**改造范围：**
- ✅ RSS 源（`rss_sources` 表）
- ✅ 自定义源（`custom_sources` 表）
- ❌ 热源/NewsNow 平台 - 保持现状

## 术语表

- **RSS_Source**: RSS 订阅源，包含 URL、名称、分类等元信息
- **Custom_Source**: 自定义源，使用 Provider 机制抓取的非 RSS 数据源
- **RSS_Entry**: RSS 条目，从订阅源抓取的单条新闻/文章
- **Source_Stats**: 源统计表，存储每个源（RSS 或自定义）的调度统计数据
- **Cadence**: 调度节奏等级（P0-P6），决定抓取间隔
- **Frequency_Type**: 更新频率类型（realtime/high/daily/daily_fixed/weekly/monthly/low）
- **Hit_Rate**: 命中率，有新内容的抓取次数除以总抓取次数
- **Publish_Time_Prediction**: 发布时间预测，基于历史发布时间的统计分析
- **Smart_Scheduler**: 智能调度器服务，负责频率分类和下次检查时间计算

## 需求

### 需求 1：源统计数据存储

**用户故事：** 作为系统管理员，我希望系统能够持久化存储每个源（RSS 源和自定义源）的调度统计数据，以便智能调度器能够基于历史数据做出决策。

#### 验收标准

1. THE Source_Stats 表 SHALL 存储以下字段：source_id（主键）、source_type（rss/custom）、frequency_type、cadence、avg_publish_hour、std_publish_hour、next_due_at、last_check_at、last_article_at、fail_count、backoff_until、last_error、check_count、hit_count、created_at、updated_at
2. WHEN 系统首次抓取某个源时，THE Smart_Scheduler SHALL 在 Source_Stats 表中创建该源的统计记录
3. WHEN 统计记录被更新时，THE Smart_Scheduler SHALL 同时更新 updated_at 时间戳
4. THE Source_Stats 表 SHALL 为 next_due_at 和 source_type 字段创建索引以支持高效的到期查询

### 需求 2：更新频率分类

**用户故事：** 作为系统管理员，我希望系统能够根据源的历史条目自动分类其更新频率，以便为不同类型的源分配合适的抓取间隔。

#### 验收标准

1. WHEN 分析源的历史条目时，THE Smart_Scheduler SHALL 计算最近 20 条条目之间的平均间隔时间
2. WHEN 平均间隔小于 6 小时或每日发布 5 条以上时，THE Smart_Scheduler SHALL 将频率类型分类为 "realtime"，对应节奏 P0
3. WHEN 平均间隔在 6-18 小时之间时，THE Smart_Scheduler SHALL 将频率类型分类为 "high"，对应节奏 P1
4. WHEN 平均间隔在 18-36 小时之间时，THE Smart_Scheduler SHALL 将频率类型分类为 "daily"，对应节奏 P2
5. WHEN 平均间隔在 36-72 小时之间时，THE Smart_Scheduler SHALL 将频率类型分类为 "daily_fixed"，对应节奏 P3
6. WHEN 平均间隔在 72-168 小时之间时，THE Smart_Scheduler SHALL 将频率类型分类为 "weekly"，对应节奏 P4
7. WHEN 平均间隔在 168-720 小时之间时，THE Smart_Scheduler SHALL 将频率类型分类为 "monthly"，对应节奏 P5
8. WHEN 平均间隔超过 720 小时时，THE Smart_Scheduler SHALL 将频率类型分类为 "low"，对应节奏 P6
9. WHEN 历史条目少于 3 条时，THE Smart_Scheduler SHALL 默认使用 "daily" 频率类型和 P2 节奏

### 需求 3：发布时间预测

**用户故事：** 作为系统管理员，我希望系统能够预测源的发布时间，以便在最可能有新内容的时间进行抓取。

#### 验收标准

1. WHEN 分析源的历史条目时，THE Smart_Scheduler SHALL 计算最近 30 条条目的平均发布小时（0-23.99）
2. WHEN 计算发布时间统计时，THE Smart_Scheduler SHALL 计算发布小时的标准差
3. THE Smart_Scheduler SHALL 将标准差限制在 1.0 到 6.0 小时的合理范围内
4. WHEN 历史条目少于 3 条时，THE Smart_Scheduler SHALL 返回空的发布时间统计（None）
5. WHEN 计算下次检查时间时，THE Smart_Scheduler SHALL 使用平均发布时间加上一个标准差作为检查时间点

### 需求 4：命中率追踪

**用户故事：** 作为系统管理员，我希望系统能够追踪每个源的命中率，以便评估调度策略的有效性。

#### 验收标准

1. WHEN 每次抓取源后，THE Smart_Scheduler SHALL 递增 check_count 计数
2. WHEN 抓取到新内容时，THE Smart_Scheduler SHALL 递增 hit_count 计数
3. THE Smart_Scheduler SHALL 计算命中率为 hit_count / check_count
4. WHEN 查询调度器统计信息时，THE Smart_Scheduler SHALL 返回平均命中率百分比

### 需求 5：自动节奏调整

**用户故事：** 作为系统管理员，我希望系统能够根据实际更新频率自动调整源的抓取节奏，以便优化资源使用。

#### 验收标准

1. WHEN 每 10 次检查后，THE Smart_Scheduler SHALL 重新分析源的更新频率
2. WHEN 首次命中新内容且检查次数小于等于 3 时，THE Smart_Scheduler SHALL 立即重新分析更新频率
3. WHEN 重新分析后频率类型发生变化时，THE Smart_Scheduler SHALL 更新对应的节奏等级
4. THE Smart_Scheduler SHALL 保持与现有 P0-P6 节奏命名的兼容性
5. WHEN 源没有足够的历史数据时，THE Smart_Scheduler SHALL 保持手动设置的节奏不变

### 需求 6：下次检查时间计算

**用户故事：** 作为系统管理员，我希望系统能够智能计算每个源的下次检查时间，以便在最优时间进行抓取。

#### 验收标准

1. WHEN 源有规律的发布模式（daily/daily_fixed/weekly）且有发布时间统计时，THE Smart_Scheduler SHALL 基于预测的发布时间计算下次检查时间
2. WHEN 使用时间预测策略时，THE Smart_Scheduler SHALL 在平均发布时间加一个标准差后进行检查
3. WHEN 预测的检查时间已过时，THE Smart_Scheduler SHALL 将检查时间推迟到第二天
4. THE Smart_Scheduler SHALL 确保等待时间不超过基础间隔的 2 倍
5. WHEN 源没有规律的发布模式时，THE Smart_Scheduler SHALL 使用固定间隔加随机抖动（0.85-1.15）
6. THE Smart_Scheduler SHALL 确保最大等待时间不超过 24 小时

### 需求 7：失败退避处理

**用户故事：** 作为系统管理员，我希望系统能够在抓取失败时进行智能退避，以避免对源服务器造成过大压力。

#### 验收标准

1. WHEN 遇到速率限制错误（429 或包含 "rate"/"频繁"）时，THE Smart_Scheduler SHALL 退避 6 小时
2. WHEN 遇到认证过期错误（401 或包含 "expired"/"过期"）时，THE Smart_Scheduler SHALL 不进行退避
3. WHEN 遇到禁止访问错误（403 或包含 "forbidden"）时，THE Smart_Scheduler SHALL 退避 12 小时
4. WHEN 遇到其他错误时，THE Smart_Scheduler SHALL 使用指数退避策略，最大 24 小时
5. WHEN 抓取成功时，THE Smart_Scheduler SHALL 重置失败计数和退避时间

### 需求 8：与现有调度器集成

**用户故事：** 作为开发者，我希望智能调度器能够无缝集成到现有的 RSS 预热生产者循环和自定义源抓取循环中，以便渐进式迁移。

#### 验收标准

1. THE Smart_Scheduler SHALL 作为独立服务模块实现，不修改现有调度器的核心逻辑
2. WHEN RSS 源有统计记录时，THE _rss_warmup_producer_loop SHALL 使用智能调度器计算的 next_due_at
3. WHEN RSS 源没有统计记录时，THE _rss_warmup_producer_loop SHALL 继续使用现有的固定间隔调度
4. WHEN RSS 抓取完成后，THE _rss_process_warmup_one SHALL 调用智能调度器更新统计数据
5. WHEN 自定义源有统计记录时，THE _custom_ingest_loop SHALL 使用智能调度器计算的 next_due_at
6. WHEN 自定义源没有统计记录时，THE _custom_ingest_loop SHALL 继续使用现有的固定间隔调度
7. WHEN 自定义源抓取完成后，THE _custom_ingest_loop SHALL 调用智能调度器更新统计数据
8. THE Smart_Scheduler SHALL 提供获取到期源列表的函数，支持按源类型（rss/custom）过滤

### 需求 9：调度器统计信息查询

**用户故事：** 作为系统管理员，我希望能够查询智能调度器的整体统计信息，以便监控系统运行状态。

#### 验收标准

1. THE Smart_Scheduler SHALL 提供获取整体统计信息的函数
2. WHEN 查询统计信息时，THE Smart_Scheduler SHALL 返回：总源数、有统计记录的源数、各节奏等级的分布、当前到期数、退避中的数量、平均命中率
3. THE Smart_Scheduler SHALL 支持按节奏等级分组统计源数量
4. THE Smart_Scheduler SHALL 支持按源类型（rss/custom）分别统计
