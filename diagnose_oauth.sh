#!/bin/bash

echo "=== OAuth 问题诊断工具 ==="
echo ""

echo "1. 检查容器状态:"
docker ps --filter "name=hotnews-viewer" --format "{{.Names}}: {{.Status}}"
echo ""

echo "2. 检查端口映射:"
docker port hotnews-viewer
echo ""

echo "3. 测试本地 OAuth 端点:"
echo "   /api/auth/oauth/google:"
curl -I http://localhost:8090/api/auth/oauth/google 2>&1 | head -5
echo ""

echo "4. 测试 callback 端点 (模拟):"
echo "   /api/auth/oauth/google/callback:"
curl -I "http://localhost:8090/api/auth/oauth/google/callback?code=test123" 2>&1 | head -5
echo ""

echo "5. 检查最近的 HTTP 请求 (非健康检查):"
docker logs hotnews-viewer --since 15m 2>&1 | grep "INFO:.*HTTP" | grep -v "GET /health" | tail -10
echo ""

echo "6. 检查是否有 OAuth 日志:"
docker logs hotnews-viewer --since 15m 2>&1 | grep -i "\[AUTH\]\|oauth\|callback" | head -10
if [ $? -ne 0 ]; then
    echo "   (无 OAuth 相关日志)"
fi
echo ""

echo "7. 检查环境变量:"
docker exec hotnews-viewer env | grep -E "GOOGLE_OAUTH|HOTNEWS_BASE_URL"
echo ""

echo "8. 检查是否有反向代理:"
ps aux | grep -E "nginx|caddy|traefik|apache" | grep -v grep
if [ $? -ne 0 ]; then
    echo "   (本地未发现反向代理进程)"
fi
echo ""

echo "9. 检查 8090 端口监听:"
lsof -i :8090 2>/dev/null || netstat -an | grep 8090 2>/dev/null || ss -tuln | grep 8090 2>/dev/null
echo ""

echo "=== 诊断完成 ==="
echo ""
echo "💡 提示:"
echo "如果 OAuth callback 请求没有到达容器，可能原因："
echo "1. Cloudflare 或 CDN 拦截/缓存了请求"
echo "2. 有外部 nginx/反向代理但配置不正确"
echo "3. 防火墙规则阻止了请求"
echo "4. Google OAuth 配置的回调 URL 不正确"
