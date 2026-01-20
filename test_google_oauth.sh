#!/bin/bash

echo "=== 测试 Google OAuth 端点 ==="
echo ""

echo "1. 测试 OAuth 启动端点："
curl -I http://localhost:8090/api/auth/oauth/google 2>&1 | head -10
echo ""

echo "2. 测试 /api/auth/me 端点："
curl -s http://localhost:8090/api/auth/me | jq . 2>/dev/null || curl -s http://localhost:8090/api/auth/me
echo ""

echo "3. 检查容器日志（最近 30 秒）："
docker logs hotnews-viewer --since 30s 2>&1 | grep -v "GET /health" | tail -10
echo ""

echo "4. 测试数据库连接："
docker exec hotnews-viewer python -c "
import sqlite3
conn = sqlite3.connect('/app/output/user.db')
print(f'数据库连接正常，总用户数: {conn.execute(\"SELECT COUNT(*) FROM users\").fetchone()[0]}')
"
echo ""

echo "=== 请访问以下 URL 测试 Google 登录 ==="
echo "https://hot.uihash.com/api/auth/oauth/google"
echo ""
echo "或者本地测试："
echo "http://localhost:8090/api/auth/oauth/google"
