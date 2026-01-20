# OAuth 修复部署指南

## 问题总结

1. ❌ 生产服务器缺少 `bcrypt` 依赖
2. ❌ 代理配置导致无法连接 Google API
3. ✅ 本地已修复并测试通过

## 已修复的内容

### 1. Dockerfile.viewer
- 移除了不稳定的清华镜像源
- 使用官方 PyPI 源
- 确保 bcrypt 正确安装

### 2. docker/.env
- 移除了代理配置：`HOTNEWS_OAUTH_PROXY=`
- （如果生产服务器需要代理访问 Google，需要配置可用的代理）

### 3. hotnews/kernel/auth/auth_api.py
- 添加了详细的调试日志
- 改进了错误处理

## 部署步骤

### 方法 1: 使用部署脚本（推荐）

```bash
# 在生产服务器上执行
cd /path/to/hotnews

# 拉取最新代码
git pull

# 使用快速部署脚本
./deploy-fast.sh
```

### 方法 2: 手动部署

```bash
# 1. SSH 到生产服务器
ssh your-server

# 2. 进入项目目录
cd /path/to/hotnews

# 3. 拉取最新代码
git pull

# 4. 检查 .env 配置
cat docker/.env | grep OAUTH_PROXY
# 如果显示代理地址，需要确认代理是否可用
# 或者移除代理配置

# 5. 重新构建镜像
docker compose -f docker/docker-compose-build.yml build hotnews-viewer

# 6. 重启容器
docker compose -f docker/docker-compose-build.yml up -d hotnews-viewer

# 7. 检查容器状态
docker ps | grep viewer
docker logs hotnews-viewer --tail 50

# 8. 验证 bcrypt 已安装
docker exec hotnews-viewer python -c "import bcrypt; print(f'✅ bcrypt {bcrypt.__version__}')"
```

### 方法 3: 使用 CI/CD

如果你有 CI/CD 流程：

```bash
# 1. 提交代码
git add .
git commit -m "fix: OAuth bcrypt dependency and proxy issues"
git push

# 2. 触发 CI/CD 部署
# （根据你的 CI/CD 配置）
```

## 部署后验证

### 1. 检查容器状态
```bash
docker ps --filter "name=hotnews-viewer"
```

### 2. 检查 bcrypt
```bash
docker exec hotnews-viewer python -c "import bcrypt; print('✅ bcrypt installed')"
```

### 3. 检查环境变量
```bash
docker exec hotnews-viewer env | grep -E "OAUTH|BASE_URL"
```

### 4. 测试 OAuth 端点
```bash
curl -I https://hot.uihash.com/api/auth/oauth/google
# 应该返回 307 Redirect
```

### 5. 测试 callback（使用假 code）
```bash
curl -s "https://hot.uihash.com/api/auth/oauth/google/callback?code=test" | jq .
# 应该返回 "Malformed auth code" 错误（这是正常的）
```

## 测试 OAuth 登录

部署完成后：

1. **清除浏览器 Cookie**
   - 打开开发者工具（F12）
   - Application → Cookies → 删除 hot.uihash.com 的所有 cookie

2. **使用无痕模式**
   - 打开浏览器无痕窗口
   - 访问 https://hot.uihash.com
   - 点击 Google 登录

3. **检查数据库**
   ```bash
   docker exec hotnews-viewer python -c "
   import sqlite3
   conn = sqlite3.connect('/app/output/user.db')
   oauth_count = conn.execute('SELECT COUNT(*) FROM user_auth_methods').fetchone()[0]
   print(f'OAuth 用户数: {oauth_count}')
   "
   ```

## 常见问题

### Q: 代理配置怎么办？

**A:** 如果生产服务器在中国大陆，需要代理访问 Google：

1. 确保代理服务正在运行
2. 测试代理可用性：
   ```bash
   curl -x http://your-proxy:port -I https://www.google.com
   ```
3. 如果代理可用，在 `docker/.env` 中配置：
   ```
   HOTNEWS_OAUTH_PROXY=http://your-proxy:port
   ```

### Q: 如何查看实时日志？

**A:** 
```bash
docker logs hotnews-viewer --tail 100 --follow | grep -E "\[AUTH\]|oauth"
```

### Q: 如何回滚？

**A:**
```bash
# 回滚到之前的镜像
docker compose -f docker/docker-compose-build.yml down
docker compose -f docker/docker-compose-build.yml up -d
```

## 预期结果

部署成功后：
- ✅ 用户可以通过 Google OAuth 登录
- ✅ 用户数据正确写入 `user_auth_methods` 表
- ✅ Session 正常工作
- ✅ 可以在数据库中查询到 OAuth 用户

## 需要的文件

确保以下文件已更新：
- ✅ `docker/Dockerfile.viewer` - 移除清华镜像源
- ✅ `docker/.env` - 代理配置
- ✅ `hotnews/kernel/auth/auth_api.py` - 添加日志
- ✅ `docker/requirements.viewer.txt` - 包含 bcrypt

## 联系方式

如果部署遇到问题，检查：
1. 容器日志：`docker logs hotnews-viewer`
2. 数据库状态：查询 `user_auth_methods` 表
3. 网络连接：测试是否能访问 Google API
