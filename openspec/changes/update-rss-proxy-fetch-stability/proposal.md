# Change: Improve RSS proxy fetch stability (non-evasive)

## Why

RSS 订阅的预览与抓取依赖服务器侧 RSS proxy fetch（例如 `rss_proxy_fetch_cached` / `rss_proxy_fetch_warmup`）。

在不违反网站条款、不进行对抗型绕过的前提下，我们希望提升请求稳定性与可观测性，降低因超时/限流/拦截导致的“预览失败 / 刷新失败”体验。

## What Changes

- **Headers（非对抗）**
  - 为 RSS proxy fetch 请求补充常见的 `Accept-Language`（例如 `zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7`）。
  - `User-Agent` 保持稳定并可配置（例如通过环境变量覆盖），默认继续使用项目内置 UA。
  - 默认不伪造 `Referer`；仅在未来如确有业务需求时考虑基于 allowlist 的配置化开启。

- **Timeout（connect/read 分离）**
  - 将单值 timeout 改为 connect/read 双超时（例如 connect=3s, read=10s），并保持可配置。

- **错误分类与日志**
  - 当上游返回 HTTP `403/429/503` 时，输出明确日志：
    - “可能触发了反爬或访问频率限制”
  - 保持克制重试：
    - 不进行重试轰炸
    - 仅对可重试错误（超时、连接错误、429、部分 5xx）进行有限次数重试与退避

## Impact

- Affected specs:
  - `rss-proxy-resilience`
- Affected code:
  - `trendradar/web/rss_proxy.py`

## Non-Goals

- 不实现绕过验证码/登录/付费墙。
- 不引入 `fake-useragent` 或 UA 轮换策略。
- 不默认伪造 `Referer`。

## Acceptance Criteria

- RSS proxy fetch 请求默认携带合理的 `Accept-Language`。
- RSS proxy fetch 支持 connect/read 双超时配置。
- 当上游返回 403/429/503 时，有明确日志提示“可能触发了反爬或访问频率限制”。
- 重试保持克制（有限次数 + 退避），不会对上游造成重试轰炸。
