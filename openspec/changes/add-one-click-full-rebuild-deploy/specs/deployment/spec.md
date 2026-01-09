## ADDED Requirements

### Requirement: 一键全量重建部署脚本（固定流程）
系统 MUST 提供一个单一入口脚本，用于按固定流程完成：本地提交、双远端 push、服务器 pull、三服务全量 rebuild、失败回滚、成功验证。

#### Scenario: 本地提交前展示改动并要求输入 message
- **WHEN** 用户执行一键部署脚本
- **THEN** 脚本必须展示当前改动摘要（至少包含 `git status` 与 `git diff --stat`）
- **AND THEN** 脚本必须交互式要求输入 commit message（不能为空）
- **AND THEN** 脚本执行 `git add .` 与 `git commit -m <message>`

#### Scenario: push 到两个远端
- **WHEN** 本地 commit 成功
- **THEN** 脚本必须执行 `git push origin main`
- **AND THEN** 脚本必须执行 `git push gitee main`

#### Scenario: 服务器端 pull + 三服务全量重建
- **WHEN** push 完成
- **THEN** 脚本必须在服务器执行 `git pull origin main`
- **AND THEN** 脚本必须执行 `docker compose -f docker-compose-build.yml build trend-radar trend-radar-viewer trend-radar-mcp`
- **AND THEN** 脚本必须执行 `docker compose -f docker-compose-build.yml up -d --force-recreate trend-radar trend-radar-viewer trend-radar-mcp`

#### Scenario: 部署失败自动回滚
- **WHEN** 服务器端 pull/build/up 任一步失败
- **THEN** 脚本必须回滚到部署前的 commit（`git reset --hard <old_head>`）
- **AND THEN** 脚本必须重新执行三服务 build/up

#### Scenario: 成功后健康检查与容器状态确认
- **WHEN** 服务器端 build/up 成功
- **THEN** 脚本必须执行 `curl -fsS http://127.0.0.1:8090/health && echo`
- **AND THEN** 脚本必须执行 `docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' | grep trend-radar`

#### Scenario: SSH 交互式密码输入
- **WHEN** 用户环境未配置 SSH key
- **THEN** 脚本必须允许 SSH 自然提示用户输入密码（不强制依赖 `sshpass`）
