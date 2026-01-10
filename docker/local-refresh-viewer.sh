#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

INGEST=false
VIEWER_PORT="${VIEWER_PORT:-8090}"

print_usage() {
  cat <<'USAGE'
Usage:
  bash docker/local-refresh-viewer.sh [--ingest]

What it does:
  - Build hotnews-viewer image
  - Restart viewer via docker compose up -d --force-recreate
  - Wait for /health
  - (Optional) run provider ingestion once inside the viewer container

Options:
  --ingest   Run provider ingestion once after viewer is healthy
USAGE
}

for arg in "$@"; do
  case "$arg" in
    --ingest)
      INGEST=true
      ;;
    -h|--help)
      print_usage
      exit 0
      ;;
    *)
      echo "❌ Unknown arg: $arg"
      print_usage
      exit 1
      ;;
  esac
done

cd "$PROJECT_ROOT"

if ! command -v docker >/dev/null 2>&1; then
  echo "❌ docker not found"
  exit 1
fi

COMPOSE_CMD=""
if docker compose version >/dev/null 2>&1; then
  COMPOSE_CMD="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE_CMD="docker-compose"
else
  echo "❌ docker compose not found"
  exit 1
fi

echo "🔧 local-refresh-viewer"
echo "  - project_root: ${PROJECT_ROOT}"
echo "  - viewer_port:  ${VIEWER_PORT}"
echo "  - ingest:       ${INGEST}"

if [ "${FORCE_CONFIG_REV:-}" = "1" ] && [ -z "${CONFIG_REV:-}" ]; then
  CONFIG_REV="$(date +%s)"
  export CONFIG_REV
fi

echo "🧱 Building hotnews-viewer..."
$COMPOSE_CMD -f docker/docker-compose-build.yml build hotnews-viewer

echo "🔄 Recreating hotnews-viewer (force-recreate)..."
$COMPOSE_CMD -f docker/docker-compose-build.yml up -d --force-recreate hotnews-viewer

echo "⏳ Waiting for /health ..."
health_ok=false
for i in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:${VIEWER_PORT}/health" >/dev/null 2>&1; then
    health_ok=true
    break
  fi
  sleep 2
  echo "  ... (${i}/30)"
done

if [ "$health_ok" != "true" ]; then
  echo "❌ viewer health check failed"
  echo "--- docker ps ---"
  docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' | sed -n '1,12p' || true
  echo "--- viewer logs (tail) ---"
  if docker ps --format '{{.Names}}' | grep -q '^hotnews-viewer$'; then
    docker logs --tail 200 hotnews-viewer || true
  fi
  exit 1
fi

echo "✅ viewer healthy"

if [ "$INGEST" = "true" ]; then
  echo "▶️  running provider ingestion once (inside viewer container)"
  docker exec -i hotnews-viewer sh -c "python - <<'PY'
from datetime import datetime
from hotnews.providers.runner import build_default_registry, run_provider_ingestion_once
ok, metrics = run_provider_ingestion_once(
    registry=build_default_registry(),
    project_root='/app',
    config_path='/app/config/config.yaml',
    now=datetime.now(),
)
print('ok=', ok)
print('metrics=', metrics)
PY"
fi

echo "🎉 done"
