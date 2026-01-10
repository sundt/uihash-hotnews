#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

cd "$PROJECT_ROOT"

if ! command -v docker >/dev/null 2>&1; then
  echo "❌ 未检测到 docker。请先安装 Docker Desktop (macOS) 并确保 docker 命令可用。"
  exit 1
fi

COMPOSE_CMD=""
if docker compose version >/dev/null 2>&1; then
  COMPOSE_CMD="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE_CMD="docker-compose"
else
  echo "❌ 未检测到 docker compose。请确认 Docker Desktop 已安装并启用 Compose。"
  exit 1
fi

VIEWER_PORT="${VIEWER_PORT:-8090}"

if [ -z "${HOTNEWS_VIEWER_TAG:-}" ]; then
  if command -v git >/dev/null 2>&1; then
    guessed_tag=$(git describe --tags --exact-match 2>/dev/null || true)
  else
    guessed_tag=""
  fi
  if [ -n "$guessed_tag" ]; then
    export HOTNEWS_VIEWER_TAG="$guessed_tag"
    echo "ℹ️ 未设置 HOTNEWS_VIEWER_TAG，使用当前 Git tag: $HOTNEWS_VIEWER_TAG"
  else
    echo "❌ 未设置 HOTNEWS_VIEWER_TAG（要求使用明确版本号，如 v1.2.3）"
    echo "请先执行："
    echo "  export HOTNEWS_VIEWER_TAG=v1.2.3"
    exit 1
  fi
fi

if [ "$HOTNEWS_VIEWER_TAG" = "latest" ] || echo "$HOTNEWS_VIEWER_TAG" | grep -qi '^latest$'; then
  echo "❌ 禁止使用 latest 作为 HOTNEWS_VIEWER_TAG"
  exit 1
fi
if ! echo "$HOTNEWS_VIEWER_TAG" | grep -q '^v'; then
  echo "❌ HOTNEWS_VIEWER_TAG 必须以 v 开头（如 v1.2.3），当前: $HOTNEWS_VIEWER_TAG"
  exit 1
fi

echo "🧪 Local validate: build + up hotnews-viewer on 127.0.0.1:${VIEWER_PORT}"

$COMPOSE_CMD -f docker/docker-compose-build.yml build hotnews-viewer
$COMPOSE_CMD -f docker/docker-compose-build.yml up -d hotnews-viewer

echo "⏳ 等待 /health ..."
for i in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:${VIEWER_PORT}/health" >/dev/null 2>&1; then
    echo "✅ 本地 viewer 健康检查通过"
    printf "validated_at=%s\nviewer_port=%s\nviewer_tag=%s\n" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$VIEWER_PORT" "$HOTNEWS_VIEWER_TAG" > .local_validation_ok
    echo "✅ 已写入 .local_validation_ok（sync-to-server.sh 将要求该文件存在）"
    exit 0
  fi
  sleep 2
done

echo "❌ 本地健康检查失败："
$COMPOSE_CMD -f docker/docker-compose-build.yml ps || true

echo "--- viewer logs (tail) ---"
if docker ps --format '{{.Names}}' | grep -q '^hotnews-viewer$'; then
  docker logs --tail 200 hotnews-viewer || true
fi

exit 1
