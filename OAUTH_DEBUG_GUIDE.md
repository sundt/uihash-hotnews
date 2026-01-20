# OAuth 登录调试指南

## 当前状态

✅ bcrypt 已安装  
✅ OAuth API 端点已注册  
✅ 环境变量配置正确  
✅ 用户可以点击登录并跳转到 Google  
❌ **Google 授权后的回调没有到达服务器**

## 问题诊断

从日志可以看到：
```
INFO: 172.67.70.18:40076 - "GET /api/auth/oauth/google HTTP/1.1" 307 Temporary Redirect
```

这说明：
1. 用户点击了 Google 登录 ✅
2. 服务器正确重定向到 Google ✅  
3. **但是没有看到 callback 请求** ❌

## 根本原因

**Google Cloud Console 中的授权重定向 URI 配置可能不正确**

## 解决方案

### 1. 检查 Google Cloud Console 配置

访问：https://console.cloud.google.com/apis/credentials

找到你的 OAuth 2.0 客户端 ID：`328437817656-g9eg2i4vallbgapd4iva3ulf5tn1p4ok.apps.googleusercontent.com`

### 2. 确认授权重定向 URI

必须包含以下 URL（**完全匹配，包括协议**）：

```
https://hot.uihash.com/api/auth/oauth/google/callback
```

**注意事项：**
- ✅ 必须是 `https://`（不是 `http://`）
- ✅ 必须是完整域名 `hot.uihash.com`
- ✅ 路径必须是 `/api/auth/oauth/google/callback`
- ❌ 不要有尾部斜杠
- ❌ 不要有查询参数

### 3. 如果配置正确但仍然失败

检查以下可能的问题：

#### A. Cloudflare 或 CDN 配置
如果使用了 Cloudflare，确保：
- OAuth 回调路径没有被缓存
- 没有被 WAF 规则拦截
- SSL/TLS 模式设置正确（Full 或 Full (strict)）

#### B. 代理配置
环境变量中有：`HOTNEWS_OAUTH_PROXY=http://172.17.0.1:7890`

这个代理用于**服务器访问 Google API**（在中国大陆需要），不影响用户的回调。

#### C. 浏览器控制台检查
打开浏览器开发者工具（F12），查看：
1. Network 标签页
2. 授权后是否有重定向到 `/api/auth/oauth/google/callback`
3. 如果有，状态码是什么？
4. 如果没有，说明 Google 没有重定向回来

### 4. 测试步骤

1. **更新 Google Cloud Console 配置**
   - 添加正确的回调 URL
   - 保存更改

2. **清除浏览器缓存和 Cookie**
   ```bash
   # 或者使用无痕模式测试
   ```

3. **再次尝试登录**
   - 访问 https://hot.uihash.com
   - 点击 Google 登录
   - 授权后观察是否重定向回网站

4. **查看服务器日志**
   ```bash
   docker logs hotnews-viewer --tail 100 --follow | grep -i "oauth\|callback\|google"
   ```

### 5. 预期的正常流程

```
用户点击登录
  ↓
GET /api/auth/oauth/google (307 Redirect)
  ↓
跳转到 Google 授权页面
  ↓
用户授权
  ↓
Google 重定向回: /api/auth/oauth/google/callback?code=xxx
  ↓
服务器处理 callback，创建用户和 session
  ↓
重定向到首页，设置 session cookie
  ↓
用户已登录 ✅
```

### 6. 当前缺失的步骤

```
用户授权
  ↓
❌ Google 重定向回调没有到达服务器
```

## 快速验证命令

```bash
# 1. 检查 OAuth 配置
docker exec hotnews-viewer env | grep OAUTH

# 2. 实时监控日志
docker logs hotnews-viewer --tail 0 --follow

# 3. 测试 callback 端点（模拟）
curl -I "https://hot.uihash.com/api/auth/oauth/google/callback?code=test"
```

## GitHub OAuth 配置

如果也要配置 GitHub OAuth，回调 URL 应该是：
```
https://hot.uihash.com/api/auth/oauth/github/callback
```

在 GitHub Settings → Developer settings → OAuth Apps 中配置。

## 微信 OAuth 配置

如果要配置微信扫码登录，回调 URL 应该是：
```
https://hot.uihash.com/api/auth/oauth/wechat/callback
```

在微信开放平台中配置。

## 下一步

1. 检查并更新 Google Cloud Console 中的授权重定向 URI
2. 再次测试登录
3. 如果仍然失败，提供浏览器控制台的 Network 截图
