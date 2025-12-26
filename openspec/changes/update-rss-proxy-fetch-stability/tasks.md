## 1. Backend

- [ ] 1.1 提取/统一 RSS proxy fetch 的默认 headers 构造逻辑
  - [ ] 默认包含 `Accept-Language`
  - [ ] `User-Agent` 支持环境变量覆盖（保持稳定，不轮换）
  - [ ] 默认不设置 `Referer`

- [ ] 1.2 将 RSS proxy fetch timeout 改为 connect/read 双超时（配置化）

- [ ] 1.3 错误分类日志
  - [ ] 403/429/503 输出明确提示：可能触发反爬或访问频率限制
  - [ ] 保持重试克制：有限次数 + 退避 + 尊重 `Retry-After`

## 2. Verification

- [ ] 2.1 手工验证：预览/抓取正常源不受影响
- [ ] 2.2 手工验证：模拟 403/429/503 时日志输出符合预期
