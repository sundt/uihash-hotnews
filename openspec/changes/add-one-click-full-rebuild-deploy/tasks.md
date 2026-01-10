## 1. Proposal Approval
- [ ] 1.1 确认脚本入口名称（默认：`deploy-rebuild.sh`）
- [ ] 1.2 确认默认分支与远端（默认：`main`、`origin`、`gitee`）

## 2. Implement Local Commit + Push
- [ ] 2.1 打印当前改动摘要：`git status` + `git diff --stat`
- [ ] 2.2 交互输入 commit message（不允许空 message）
- [ ] 2.3 执行 `git add .` 与 `git commit -m ...`
- [ ] 2.4 push：`git push origin main` 与 `git push gitee main`

## 3. Implement Remote Rebuild + Verify
- [ ] 3.1 SSH 到服务器执行：记录 `old_head=$(git rev-parse HEAD)`
- [ ] 3.2 `git pull origin main`，若无新提交则退出
- [ ] 3.3 `docker compose -f docker-compose-build.yml build ...` + `up -d --force-recreate ...`
- [ ] 3.4 健康检查：`curl -fsS http://127.0.0.1:8090/health && echo`
- [ ] 3.5 容器检查：`docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' | grep hotnews`

## 4. Implement Rollback on Failure
- [ ] 4.1 任何远端步骤失败：`git reset --hard $old_head`，然后重新 build/up
- [ ] 4.2 回滚后同样执行健康检查与容器检查
- [ ] 4.3 若回滚也失败：脚本退出并打印可复制的手动恢复命令

## 5. UX / Safety
- [ ] 5.1 默认不使用 `sshpass`（让 SSH 自然提示输入密码）
- [ ] 5.2 打印每一步执行命令（便于手动复现）
- [ ] 5.3 提供 `--dry-run`（可选）
