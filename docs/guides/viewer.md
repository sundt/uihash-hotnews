# 新闻分类查看器使用指南

## 📋 功能简介

Hotnews 新闻分类查看器是一个基于 Web 的新闻浏览界面，提供以下功能：

- **🗂️ 智能分类**：按 4 大类型自动组织新闻（综合新闻、财经投资、社交娱乐、科技平台）
- **🔍 内容过滤**：基于黑名单关键词自动过滤不感兴趣的内容
- **🎯 精准控制**：支持 3 种过滤模式（严格、适中、关闭）
- **📊 统计展示**：实时显示新闻数量、过滤统计等信息
- **🔎 搜索功能**：支持实时搜索新闻标题
- **📱 响应式设计**：支持桌面和移动设备

## 🚀 快速开始

### 1. 启动查看器

**macOS/Linux:**
```bash
./start-viewer.sh
```

**Windows:**
```bash
start-viewer.bat
```

### 2. 访问界面

打开浏览器访问：http://localhost:8080/viewer

## ⚙️ 配置说明

### 查看器配置

编辑 `config/config.yaml`，添加或修改 `viewer` 部分：

```yaml
viewer:
  # 过滤模式：strict(严格) | moderate(适中) | off(关闭)
  filter_mode: "moderate"

  # 自动刷新
  auto_refresh: true
  refresh_interval: 300  # 刷新间隔（秒）

  # 黑名单配置
  blacklist:
    enabled: true
    keywords_file: "config/filter_blacklist.txt"
```

### 过滤模式说明

| 模式 | 说明 | 适用场景 |
|------|------|---------|
| `strict` | 严格模式 - 任意关键词匹配即过滤 | 需要极度精简内容时 |
| `moderate` | 适中模式 - 2+ 关键词匹配才过滤（推荐） | 日常使用，平衡过滤效果 |
| `off` | 关闭过滤 - 显示所有新闻 | 需要查看完整内容时 |

### 黑名单关键词配置

编辑 `config/filter_blacklist.txt` 自定义过滤关键词：

```txt
# 每行一个关键词
# 以 # 开头的行为注释
# 不区分大小写

# 战争/冲突
战争
俄乌
巴以

# 明星娱乐
明星
娱乐圈
绯闻

# 添加你自己的关键词
```

## 🎨 界面功能

### 1. 统计面板

页面顶部显示：
- 显示新闻数量
- 已过滤新闻数量
- 分类数量
- 更新时间

### 2. 过滤控制

- **过滤模式选择器**：快速切换过滤模式
- **热门过滤词**：显示命中最多的过滤关键词

### 3. 搜索功能

- 在搜索框输入关键词，实时过滤新闻
- 支持跨分类搜索

### 4. 分类面板

每个分类显示：
- 分类图标和名称
- 新闻数量
- 过滤数量
- 点击展开/折叠

### 5. 平台卡片

每个平台显示：
- 平台名称
- 新闻列表（默认显示前 10 条）
- 排名标识（前 5 名高亮）

## 🔧 高级功能

### URL 参数

支持通过 URL 参数临时覆盖配置：

```
# 使用严格过滤模式
http://localhost:8080/viewer?filter=strict

# 关闭过滤
http://localhost:8080/viewer?filter=off

# 只查看指定平台
http://localhost:8080/viewer?platforms=zhihu,weibo,douyin
```

### API 接口

查看器还提供 RESTful API：

```bash
# 获取分类新闻（JSON）
curl http://localhost:8080/api/news

# 获取分类列表
curl http://localhost:8080/api/categories

# 获取过滤统计
curl http://localhost:8080/api/filter/stats

# 获取黑名单关键词
curl http://localhost:8080/api/blacklist/keywords

# 重新加载黑名单
curl -X POST http://localhost:8080/api/blacklist/reload
```

完整 API 文档：http://localhost:8080/docs

## 📝 注意事项

1. **数据来源**：查看器显示的是最新一次爬取的新闻数据，请确保先运行爬虫
2. **自动刷新**：页面默认每 5 分钟自动刷新，可在配置中调整
3. **过滤效果**：修改黑名单后需要重新加载页面或调用 API 重载
4. **端口占用**：默认使用 8080 端口，如需修改可在启动脚本中指定

## 🐛 常见问题

### 1. 页面显示"暂无新闻数据"

**原因**：未运行爬虫或没有新闻数据

**解决**：
```bash
# 运行爬虫
uv run python -m hotnews
```

### 2. 过滤效果不符合预期

**解决**：
- 检查 `config/filter_blacklist.txt` 关键词是否正确
- 尝试切换过滤模式（strict/moderate/off）
- 查看过滤统计了解过滤详情

### 3. 服务器启动失败

**解决**：
```bash
# 检查依赖是否完整
uv sync
```

## 📚 相关文档

- [提案文档](../../openspec/changes/add-categorized-news-viewer/proposal.md)
- [实施任务](../../openspec/changes/add-categorized-news-viewer/tasks.md)
- [docs 索引](../README.md)
- [主 README](../../README.md)
