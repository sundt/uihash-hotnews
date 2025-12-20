# Change: 增加快速部署路径（A 热修补 / C CI+镜像仓库）

## Why
日常 UI 文案/样式类的小改动（例如更改页面标题）不应该被“构建镜像 + 传输镜像 + 重启”的大流程拖慢。
同时，当前生产环境存在：
- 服务器对 Docker Hub 的网络不稳定，导致在线 `pull` 容易失败。
- macOS 默认 `linux/arm64` 构建与服务器 `linux/amd64` 架构不一致，需要额外处理，进一步放大了“仅改 UI 也要等很久”的问题。

因此需要在部署规范中明确两条路径：
- **A：热修补（Hotfix）**：针对前端静态资源/模板小改动，快速同步到线上并尽量不中断服务。
- **C：标准发布（CI + 镜像仓库）**：通过 CI 构建并推送到服务器可访问的镜像仓库，服务器快速 pull 并滚动更新。

并明确流程约束：以后每次“小改动”，执行前必须先让你选择 A 或 C。

## What Changes
- 定义“部署方式选择”规则：对小改动必须提示选择 A 或 C。
- 定义 A 热修补的适用范围、步骤与回滚方法。
- 定义 C 标准发布的目标架构、镜像仓库要求与发布步骤。

## Impact
- Affected specs:
  - `deployment`（新增“部署路径选择 + 热修补/标准发布”要求）
- Affected code (expected, after approval):
  - 新增一个热修补脚本（例如 `hotfix-viewer.sh`）或在 `sync-to-server.sh` 中增加 hotfix 子命令。
  - 新增/接入 CI（Gitee/GitHub Actions）与镜像仓库（例如 ACR/Harbor/GitHub Packages/Gitee Packages 等）。
