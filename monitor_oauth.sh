#!/bin/bash

echo "=== 实时监控 OAuth 请求 ==="
echo "请在另一个窗口尝试登录..."
echo "按 Ctrl+C 停止监控"
echo ""

docker logs hotnews-viewer --tail 0 --follow 2>&1 | grep --line-buffered -v "GET /health" | grep --line-buffered -E "INFO:.*HTTP|\[AUTH\]|oauth|callback|google" -i
