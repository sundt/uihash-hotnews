#!/bin/bash
SERVER_USER="${HOTNEWS_SSH_USER:-root}"
SERVER_HOST="${HOTNEWS_SSH_HOST:-120.77.222.205}"
SERVER_PORT="${HOTNEWS_SSH_PORT:-52222}"
SERVER_PROJECT_ROOT="${HOTNEWS_REMOTE_ROOT:-~/hotnews}"
SERVICES="hotnews hotnews-viewer hotnews-mcp"
DC_FILE="docker-compose-build.yml"

echo "========================================"
echo "🚀 Triggering Remote Rebuild ONLY"
echo "   (Skipping local git push)"
echo "========================================"

ssh -p "${SERVER_PORT}" "${SERVER_USER}@${SERVER_HOST}" "bash -s" <<EOF
    set -e
    echo "   [Remote] cd ${SERVER_PROJECT_ROOT}..."
    cd ${SERVER_PROJECT_ROOT}
    
    echo "   [Remote] Force syncing code (fetch & reset)..."
    git fetch origin main
    git reset --hard origin/main
    
    echo "   [Remote] Updating submodules..."
    git submodule update --init --recursive
    
    echo "   [Remote] Building services ($SERVICES)..."
    cd docker
    docker compose -f ${DC_FILE} build $SERVICES
    
    echo "   [Remote] Creating containers..."
    docker compose -f ${DC_FILE} up -d --force-recreate $SERVICES
    
    echo "   ✅ Remote steps completed."
EOF

echo "========================================"
echo "✅ Rebuild Triggered."
echo "========================================"
