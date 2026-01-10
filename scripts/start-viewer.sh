#!/bin/bash

echo "╔════════════════════════════════════════╗"
echo "║  Hotnews News Viewer 启动脚本       ║"
echo "╚════════════════════════════════════════╝"
echo ""

# 检查虚拟环境
if [ ! -d ".venv" ]; then
    echo "❌ [错误] 虚拟环境未找到"
    echo "请先运行 ./setup-mac.sh 进行部署"
    echo ""
    exit 1
fi

echo "[启动] News Viewer Web 服务器"
echo "[地址] http://localhost:8080/viewer"
echo "[提示] 按 Ctrl+C 停止服务"
echo ""

# 检查是否有数据
if [ ! -d "output" ] || [ -z "$(ls -A output 2>/dev/null)" ]; then
    echo "⚠️  [警告] 未检测到新闻数据"
    echo "请先运行爬虫获取新闻数据："
    echo "  uv run python -m hotnews"
    echo ""
fi

# 启动 Web 服务器
uv run python -m hotnews.web.server --host 0.0.0.0 --port 8080
