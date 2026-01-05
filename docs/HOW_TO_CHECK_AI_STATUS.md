# 如何判断AI分类系统是否运行

## 🎯 快速检查方法

### 方法1: 运行状态检查脚本（推荐）

```bash
uv run python check_ai_status.py
```

**输出示例（正在运行）**:
```
✅ AI分类系统正在运行
   - 环境变量已配置
   - 数据库有活跃标注
   - 日志显示正常运行
```

**输出示例（未运行）**:
```
❌ AI分类系统未启用
   原因: 环境变量未配置
```

### 方法2: 查看实时日志

```bash
# 实时监控AI分类日志
tail -f logs/viewer.log | grep "mb_ai"
```

**运行中的标志**:
```
mb_ai.start prompt_version=mb_llm_filter_v2_enhanced
mb_ai.batch ok size=20 model=qwen-plus
```

**未运行**: 无任何输出

### 方法3: 检查数据库

```bash
sqlite3 output/online.db "
SELECT 
    '总标注: ' || COUNT(*) as info
FROM rss_entry_ai_labels
UNION ALL
SELECT 
    '最后标注: ' || datetime(MAX(labeled_at), 'unixepoch', 'localtime')
FROM rss_entry_ai_labels
UNION ALL
SELECT
    '最近1小时: ' || COUNT(*)
FROM rss_entry_ai_labels
WHERE labeled_at >= strftime('%s', 'now', '-1 hour')
"
```

### 方法4: 调用API

```bash
# 前提: viewer服务已启动
curl -s http://127.0.0.1:8080/api/rss/ai-classification/stats?hours=1 | jq
```

**正在运行**: 返回统计数据
**未运行**: 返回错误或空数据

## 📊 运行状态判断标准

### ✅ 正在运行的标志

1. **环境变量**: 
   - `TREND_RADAR_MB_AI_ENABLED=1`
   - `DASHSCOPE_API_KEY` 已设置

2. **数据库**:
   - 最后标注时间在10分钟内
   - 最近1小时有新标注

3. **日志**:
   - 看到 `mb_ai.batch ok` 消息
   - 无 `mb_ai_budget_exceeded` 错误

### ❌ 未运行的标志

1. **环境变量**:
   - `TREND_RADAR_MB_AI_ENABLED` 未设置或为0
   - 缺少 `DASHSCOPE_API_KEY`

2. **数据库**:
   - 最后标注时间超过1小时
   - 表不存在或为空

3. **日志**:
   - 无 `mb_ai` 相关日志
   - 看到 `mb_ai_not_enabled` 消息

### ⚠️ 配置正确但未运行

可能原因：
1. **刚启动服务** - 等待5-10分钟
2. **无新RSS数据** - 检查RSS抓取是否正常
3. **超过配额** - 查看 `TREND_RADAR_MB_AI_MAX_PER_HOUR`
4. **API错误** - 检查密钥是否有效

## 🔧 故障排查

### 问题1: 环境变量已配置但无标注

```bash
# 检查RSS数据是否存在
sqlite3 output/online.db "SELECT COUNT(*) FROM rss_entries"

# 如果返回0，说明需要先抓取RSS
./start-viewer.sh  # 会自动定期抓取
```

### 问题2: 日志中看到错误

```bash
# 查看完整错误信息
tail -100 logs/viewer.log | grep -A 5 "mb_ai"

# 常见错误:
# - "DASHSCOPE_API_KEY" → API密钥未配置或无效
# - "budget_exceeded" → 超过每小时配额
# - "timeout" → 网络超时，检查连接
```

### 问题3: Prompt版本不对

```bash
# 当前应该是 v2_enhanced
sqlite3 output/online.db "
SELECT DISTINCT prompt_version, COUNT(*) 
FROM rss_entry_ai_labels 
GROUP BY prompt_version
"

# 如果显示 v1，需要重启服务以应用新版本
```

## 📈 监控建议

### 每日检查（自动化）

创建定时任务：
```bash
# 添加到 crontab
0 */6 * * * cd /path/to/hotnews && uv run python check_ai_status.py >> logs/ai_status_check.log 2>&1
```

### 关键指标

- **标注频率**: 每小时应有10-50条（取决于RSS更新频率）
- **通过率**: 15-30%为正常范围
- **平均分数**: Include应在80-85
- **平均置信度**: Include应在0.85+

### 告警条件

设置告警（如果满足以下任一条件）：
```bash
# 1小时内无新标注
# 通过率 <5% 或 >50%
# 连续出现API错误
# 平均置信度 <0.70
```

## 📝 完整检查清单

```bash
# 1. 运行状态脚本
uv run python check_ai_status.py

# 2. 查看最近日志
tail -50 logs/viewer.log | grep "mb_ai"

# 3. 检查数据库统计
sqlite3 output/online.db "SELECT * FROM rss_entry_ai_labels ORDER BY labeled_at DESC LIMIT 5"

# 4. 测试API（如果服务运行中）
curl -s http://127.0.0.1:8080/api/rss/ai-classification/stats?hours=1 | jq '.total_labeled'

# 5. 验证环境变量
echo "Enabled: $TREND_RADAR_MB_AI_ENABLED"
echo "API Key: ${DASHSCOPE_API_KEY:0:10}..."
```

## 🚀 启动AI分类系统

如果检查发现未运行，按以下步骤启动：

```bash
# 1. 配置环境变量（在 ~/.zshrc 或 ~/.bashrc）
export TREND_RADAR_MB_AI_ENABLED=1
export DASHSCOPE_API_KEY=your_api_key_here

# 2. 重新加载环境变量
source ~/.zshrc  # 或 source ~/.bashrc

# 3. 重启viewer服务
pkill -f "uvicorn trendradar.web.server:app"  # 停止旧服务
./start-viewer.sh  # 启动新服务

# 4. 等待5-10分钟后检查
uv run python check_ai_status.py
```

## 📞 获取帮助

- 查看完整文档: [docs/RSS_AI_CLASSIFICATION.md](docs/RSS_AI_CLASSIFICATION.md)
- 运行测试脚本: `uv run python test_ai_classification.py`
- 查看优化总结: [RSS_AI_OPTIMIZATION_SUMMARY.md](RSS_AI_OPTIMIZATION_SUMMARY.md)
