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

在 `hotnews/web/server.py` 中添加自定义的 `UnicodeJSONResponse` 类：

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

## 验证修复

1. **重启 Web 服务器**：
   ```bash
   python -m hotnews.web.server
   ```

2. **测试 API**：
   ```bash
   curl http://localhost:8080/api/news | python -m json.tool
   ```

3. **访问 Web 界面**：
   打开浏览器访问 `http://localhost:8080/viewer`，查看掘金等平台是否正常显示中文。

## 相关文件

- `hotnews/web/server.py` - Web 服务器主文件
- `hotnews/crawler/fetcher.py` - 数据获取器
- `hotnews/web/templates/viewer.html` - Web 模板

## 修复日期

2025-12-19

快捷链接：
- [docs 索引](../README.md)
