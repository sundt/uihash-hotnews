## 1. Define Deployment Modes
- [ ] 1.1 定义“小改动”的判定标准（例如仅改 `viewer.html` / CSS / 静态文件，不涉及依赖与后端逻辑）。
- [ ] 1.2 明确两种模式：A 热修补 / C 标准发布（CI + 镜像仓库）。

## 2. Mode A: Hotfix (Fast Path)
- [ ] 2.1 设计热修补命令入口（独立脚本或 `sync-to-server.sh hotfix ...`）。
- [ ] 2.2 实现热修补：将目标文件同步到服务器，并更新到运行中的 viewer（例如 `docker cp`/bind mount），必要时仅重启 viewer。
- [ ] 2.3 实现热修补回滚：保留服务器端的 `.bak` 或 `.prev`，一键恢复。

## 3. Mode C: CI + Registry (Standard Release)
- [ ] 3.1 选定镜像仓库（要求服务器可访问）。
- [ ] 3.2 在 CI 中构建 `linux/amd64` 镜像并推送仓库，tag 使用版本号/日期时间。
- [ ] 3.3 服务器端部署改为优先 pull（或离线作为 fallback），并保持最小中断与健康检查。

## 4. Verification
- [ ] 4.1 UI 小改动：选择 A 热修补，完成上线时间 < 1 分钟。
- [ ] 4.2 代码/依赖改动：选择 C 标准发布，服务器可稳定拉取并通过健康检查。
