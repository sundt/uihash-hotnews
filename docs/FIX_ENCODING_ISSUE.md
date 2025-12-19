# 修复掘金等平台中文显示乱码问题

## 问题描述

在 Web 查看器中，掘金等平台的新闻标题显示为乱码（类似 `\u6398\u91d1` 这样的 Unicode 转义序列）。

## 问题原因

FastAPI 的 `JSONResponse` 默认使用 `json.dumps()` 的默认参数，其中 `ensure_ascii=True` 会将所有非 ASCII 字符（包括中文）转义为 Unicode 编码序列。

示例：
- 原始文本：`掘金`
- 错误输出：`\u6398\u91d1`

## 解决方案

### 1. 创建自定义 JSONResponse 类

在 `trendradar/web/server.py` 中添加自定义的 `UnicodeJSONResponse` 类：

```python
import json
from fastapi.responses import Response

class UnicodeJSONResponse(Response):
    media_type = "application/json"
    
    def render(self, content) -> bytes:
        return json.dumps(
            content,
            ensure_ascii=False,  # 关键：不转义非ASCII字符
            allow_nan=False,
            indent=None,
            separators=(",", ":"),
        ).encode("utf-8")
```

### 2. 替换所有 JSONResponse

将所有 API 端点的 `JSONResponse` 替换为 `UnicodeJSONResponse`：

```python
# 修改前
return JSONResponse(content=data)

# 修改后
return UnicodeJSONResponse(content=data)
```

影响的端点：
- `/api/news` - 获取分类新闻数据
- `/api/categories` - 获取分类列表
- `/api/filter/stats` - 获取过滤统计
- `/api/filter/mode` - 设置过滤模式
- `/api/blacklist/keywords` - 获取黑名单关键词
- `/api/blacklist/reload` - 重新加载黑名单
- `/api/scheduler/start` - 启动定时任务
- `/api/scheduler/stop` - 停止定时任务
- `/api/scheduler/status` - 获取任务状态
- `/api/fetch` - 立即获取数据

## 验证修复

1. **重启 Web 服务器**：
   ```bash
   python -m trendradar.web.server
   ```

2. **测试 API**：
   ```bash
   curl http://localhost:8080/api/news | python -m json.tool
   ```
   
   应该能看到正常的中文字符，如：`"掘金"`

3. **访问 Web 界面**：
   打开浏览器访问 `http://localhost:8080/viewer`，查看掘金等平台是否正常显示中文。

## 相关文件

- `trendradar/web/server.py` - Web 服务器主文件
- `trendradar/crawler/fetcher.py` - 数据获取器（已正确设置 `response.encoding = 'utf-8'`）
- `trendradar/web/templates/viewer.html` - Web 模板（已正确设置 `<meta charset="UTF-8">`）

## 技术细节

### JSON 编码参数说明

- `ensure_ascii=False`：不将非 ASCII 字符转义为 `\uXXXX` 格式
- `allow_nan=False`：禁止 NaN、Infinity 等特殊值（符合 JSON 标准）
- `separators=(",", ":")`：使用紧凑格式，减少输出大小
- `.encode("utf-8")`：将字符串编码为 UTF-8 字节流

### 为什么需要自定义类？

FastAPI 的 `JSONResponse` 内部调用 `jsonable_encoder()` 和 `json.dumps()`，但无法直接控制 `ensure_ascii` 参数。因此需要继承 `Response` 类并重写 `render()` 方法。

## 相关问题

如果其他组件也出现类似的编码问题，可以检查：

1. **数据库连接**：确保 SQLite 使用 UTF-8 编码
2. **文件读写**：确保所有文件操作使用 `encoding="utf-8"`
3. **HTTP 响应**：确保 Content-Type 包含 `charset=utf-8`
4. **前端显示**：确保 HTML 设置 `<meta charset="UTF-8">`

## 修复日期

2025-12-19
