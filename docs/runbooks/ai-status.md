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
   - `HOTNEWS_MB_AI_ENABLED=1`
   - `DASHSCOPE_API_KEY` 已设置

2. **数据库**:
   - 最后标注时间在10分钟内
   - 最近1小时有新标注

3. **日志**:
   - 看到 `mb_ai.batch ok` 消息
   - 无 `mb_ai_budget_exceeded` 错误

### ❌ 未运行的标志

1. **环境变量**:
   - `HOTNEWS_MB_AI_ENABLED` 未设置或为0
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
3. **超过配额** - 查看 `HOTNEWS_MB_AI_MAX_PER_HOUR`
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

## 📞 获取帮助

- RSS AI 分类说明：`docs/guides/rss-ai-classification.md`

快捷链接：
- [RSS AI 分类说明](../guides/rss-ai-classification.md)
- [docs 索引](../README.md)
