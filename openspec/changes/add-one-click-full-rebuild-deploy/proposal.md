# Change: 增加“一键全量重建部署”脚本（固定流程）

## Why
当前部署存在多脚本、多分支路径（hotfix/rsync/smart deploy 等），导致执行时需要思考与选择，且容易因细节差异造成线上不一致。

你希望将部署固化为单条标准流程：
1) 本地查看改动并提交
2) push 到 GitHub + Gitee
3) 服务器 pull 并全量重建三服务
4) 失败自动回滚；成功做健康检查与容器状态确认
5) SSH 需要时提示输入密码（不引入 sshpass 等工具）

## What Changes
- 新增一个单一入口脚本（建议：`deploy-rebuild.sh`），严格按固定流程执行：
  - 本地：展示 `git status` / `git diff --stat` / 可选 `git diff`，然后执行 `git add .` + 交互输入 commit message 并 `git commit`
  - 本地：push `origin main` 与 `gitee main`
  - 远端：`cd ~/hotnews && git pull origin main`
  - 远端：`cd docker && docker compose -f docker-compose-build.yml build trend-radar trend-radar-viewer trend-radar-mcp` + `up -d --force-recreate ...`
  - 远端：失败则回滚到部署前 commit 并重新 build/up
  - 远端：成功则执行健康检查与 `docker ps` 校验
- 不删除现有脚本（`deploy-smart.sh`/`hotfix-viewer.sh`/`rsync-sync.sh`/`sync-to-server.sh`），先并行保留，待新脚本稳定后再决定是否移除。

## Impact
- Affected specs:
  - `deployment`（新增“一键全量重建部署”作为推荐入口之一，并定义回滚与验证要求）
- Affected code:
  - 新增 `deploy-rebuild.sh`（或你确认的脚本名）
