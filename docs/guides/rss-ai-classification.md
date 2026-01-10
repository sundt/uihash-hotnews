# RSS AI分类系统优化说明

## 📋 优化概览

### 主要改进

1. **Enhanced Prompt (v2)**
   - ✅ 添加中文支持和中文语义理解
   - ✅ 详细的分类定义（AI_MODEL、DEV_INFRA、HARDWARE_PRO等）
   - ✅ Few-shot示例（5个典型案例）
   - ✅ 明确的决策规则和评分标准
   - ✅ 置信度阈值指导

2. **分类统计功能**
   - ✅ 按时间范围统计分类效果
   - ✅ 按action/category分组统计
   - ✅ Include平均分数和置信度
   - ✅ 严格过滤通过率
   - ✅ 模型使用统计

3. **测试和调试工具**
   - ✅ 独立测试接口，无需实际标注数据
   - ✅ 自定义测试用例
   - ✅ 查看原始AI输出
   - ✅ 测试脚本包含12个典型案例

## 🎯 分类标准

### 技术类（应该 Include）

#### AI_MODEL
- AI模型发布、算法研究
- 模型架构、训练技术、推理优化
- 示例：`OpenAI发布GPT-5模型，推理性能提升300%`

#### DEV_INFRA
- 开发工具、编程语言、框架库
- CI/CD、云原生、数据库、中间件
- 示例：`Kubernetes 1.30 released with enhanced security`

#### HARDWARE_PRO
- 芯片架构、GPU/TPU
- 服务器硬件、网络设备、存储技术
- 示例：`NVIDIA H200 GPU架构详解：Transformer Engine优化`

### 非技术类（应该 Exclude）

#### CONSUMER
- 消费电子产品、智能硬件
- 手机平板、智能家居（非技术深度）
- 示例：`iPhone 16 Pro发布：售价$999起`

#### BUSINESS
- 融资新闻、公司动态、市场分析
- 商业策略（非技术内容）
- 示例：`某AI公司完成B轮融资5亿美元`

#### MARKETING
- 营销活动、产品发布会、品牌推广
- 用户增长（非技术）
- 示例：`2024年AI行业趋势报告`

#### OTHER
- 不属于以上任何分类的内容

## 📊 评分标准

### Score (0-100)
- **90-100**: 突破性技术、重大框架发布、关键安全公告
- **75-89**: 重要更新、有用工具、深入技术文章
- **50-74**: 常规更新、小改进、一般科技新闻
- **<50**: 技术价值低或非技术内容

### Confidence (0.0-1.0)
- **≥0.90**: 非常明确的技术/商业内容
- **0.70-0.89**: 清晰但有些歧义
- **<0.70**: 不确定 → 必须选择 exclude

## 🔧 过滤规则

最终通过严格过滤需要同时满足：
- ✅ action = "include"
- ✅ score ≥ 75
- ✅ confidence ≥ 0.70
- ✅ category ∈ {AI_MODEL, DEV_INFRA, HARDWARE_PRO}

## 🚀 使用方法

### 1. 环境变量配置

```bash
# 启用AI分类
export HOTNEWS_MB_AI_ENABLED=1

# DashScope API密钥
export DASHSCOPE_API_KEY=your_api_key_here

# 可选配置
export HOTNEWS_MB_AI_MODEL=qwen-plus  # 默认qwen-plus
export HOTNEWS_MB_AI_BATCH_SIZE=20    # 每批处理数量
export HOTNEWS_MB_AI_MAX_PER_HOUR=200 # 每小时最大请求数
export HOTNEWS_MB_AI_TIMEOUT_S=30     # 超时时间（秒）
```

### 2. 运行测试

```bash
# 测试分类效果
python test_ai_classification.py
```

### 3. API接口

#### 获取分类统计

```bash
# 最近24小时统计
curl http://127.0.0.1:8090/api/rss/ai-classification/stats?hours=24

# 最近7天统计
curl http://127.0.0.1:8090/api/rss/ai-classification/stats?hours=168
```

#### 测试分类效果

```bash
curl -X POST http://127.0.0.1:8090/api/rss/ai-classification/test \
  -H "Content-Type: application/json" \
  -d '{
    "items": [
      {
        "id": "1",
        "source": "test",
        "domain": "github.com",
        "title": "Kubernetes 1.30 released"
      },
      {
        "id": "2",
        "source": "test",
        "domain": "techcrunch.com",
        "title": "某AI公司完成B轮融资"
      }
    ]
  }'
```

响应示例：
```json
{
  "ok": true,
  "model": "qwen-plus",
  "prompt_version": "mb_llm_filter_v2_enhanced",
  "results": [
    {
      "category": "DEV_INFRA",
      "action": "include",
      "score": 82,
      "confidence": 0.88,
      "reason": "Important infrastructure update",
      "pass_strict_filter": true
    },
    {
      "category": "BUSINESS",
      "action": "exclude",
      "score": 30,
      "confidence": 0.92,
      "reason": "融资新闻，无技术深度",
      "pass_strict_filter": false
    }
  ]
}
```

## 📈 监控和调优

### 查看分类质量

```python
from hotnews.web.rss_scheduler import mb_ai_get_classification_stats

# 获取最近24小时统计
stats = mb_ai_get_classification_stats(last_n_hours=24)

print(f"总标注: {stats['total_labeled']}")
print(f"通过率: {stats['pass_rate']}%")
print(f"平均分数: {stats['include_stats']['avg_score']}")
```

### 调整阈值

如果发现：
- **通过率太低（<10%）**: 降低 `_MB_AI_SCORE_MIN` 或 `_MB_AI_CONFIDENCE_MIN`
- **通过率太高（>50%）**: 提高阈值或优化Prompt使其更严格
- **误判较多**: 添加更多Few-shot示例，优化分类定义描述

## 🔄 版本历史

### v2_enhanced (当前版本)
- ✅ 添加中文支持
- ✅ 详细分类定义
- ✅ 5个Few-shot示例
- ✅ 明确的评分标准
- ✅ 置信度指导

### v1 (原版本)
- 基础英文Prompt
- 简单分类规则
- 无Few-shot示例

## 🐛 故障排查

### AI分类未运行
```bash
# 检查环境变量
echo $HOTNEWS_MB_AI_ENABLED
echo $DASHSCOPE_API_KEY

# 检查日志
tail -f logs/viewer.log | grep "mb_ai"
```

### API调用失败
- 检查API密钥是否正确
- 检查网络连接
- 查看超时时间是否足够
- 检查每小时配额是否用尽

### 分类效果不佳
1. 运行测试脚本查看具体案例
2. 调整Few-shot示例
3. 优化分类定义描述
4. 调整评分标准说明

## 💡 最佳实践

1. **定期监控**: 每天查看统计数据，了解分类质量
2. **收集反馈**: 记录用户反馈的误分类案例
3. **迭代优化**: 根据实际效果调整Prompt和阈值
4. **A/B测试**: 使用测试接口对比不同Prompt版本效果
5. **版本管理**: 每次Prompt修改都更新版本号，便于追溯

## 📞 支持

如有问题或建议，请查看：
- docs 索引：`docs/README.md`
- 运行状态检查：`docs/runbooks/ai-status.md`
- 主 README：`README.md`

快捷链接：
- [docs 索引](../README.md)
- [AI 状态检查](../runbooks/ai-status.md)
- [主 README](../../README.md)
- [测试脚本](../../test_ai_classification.py)
- [源码：rss_scheduler.py](../../hotnews/web/rss_scheduler.py)
