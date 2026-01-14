#!/bin/bash
set -e

# Configuration (Env vars with defaults)
SERVER_USER="${HOTNEWS_SSH_USER:-root}"
SERVER_HOST="${HOTNEWS_SSH_HOST:-120.77.222.205}"
SERVER_PORT="${HOTNEWS_SSH_PORT:-52222}"
SERVER_PROJECT_ROOT="${HOTNEWS_REMOTE_ROOT:-~/hotnews}"

# Service names (Mapped from user request "trend-radar" to actual "hotnews")
SERVICES="hotnews hotnews-viewer hotnews-mcp"
DC_FILE="docker-compose-build.yml"

echo "========================================"
echo "🚀 Starting Full Rebuild & Deploy"
echo "========================================"

# Step 1: Git Commit
echo ">>> Step 1: Git Commit..."
git add .
CHANGES=$(git diff --cached --stat)
if [ -z "$CHANGES" ]; then
    echo "No changes to commit."
else
    # Auto-commit with timestamp and stat if no message provided
    MSG="Rebuild $(date +'%Y-%m-%d %H:%M:%S')"
    # Append stats to commit body if needed, but for -m just keep it simple or use multiple -m
    git commit -m "$MSG"
    echo "✅ Committed: $MSG"
fi

# Step 2: Git Push
echo ">>> Step 2: Git Push..."
git push origin main
echo "✅ Pushed to origin/main"

# Step 3: Remote Rebuild
echo ">>> Step 3: Remote Rebuild on ${SERVER_HOST}..."

# We execute the remote commands in a single ssh session for atomicity
ssh -p "${SERVER_PORT}" "${SERVER_USER}@${SERVER_HOST}" "bash -s" <<EOF
    set -e
    echo "   [Remote] cd ${SERVER_PROJECT_ROOT}..."
    cd ${SERVER_PROJECT_ROOT}
    
    # Ensure no binary conflict (remove untracked one if exists)
    rm -f docker/supercronic-linux-amd64
    
    echo "   [Remote] git pull..."
    git pull origin main
    
    echo "   [Remote] Updating submodules..."
    git submodule update --init --recursive
    
    echo "   [Remote] Building services ($SERVICES)..."
    cd docker
    docker compose -f ${DC_FILE} build $SERVICES
    
    echo "   [Remote] Creating containers..."
    docker compose -f ${DC_FILE} up -d --force-recreate $SERVICES
    
    echo "   [Remote] Running Database Migration..."
    # Wait for container to be ready
    sleep 5
    docker cp ../scripts/migrate_add_use_scraperapi.py hotnews-viewer:/tmp/migrate_db.py
    docker exec hotnews-viewer python /tmp/migrate_db.py /app/output/online.db
    
    echo "   ✅ Remote steps completed."
EOF

# Step 4: Health Check & Rollback Warning
echo ">>> Step 4: Health Check..."

# Check health endpoint via SSH (safer than external curl usually)
echo "   Checking viewer health (http://127.0.0.1:8090/health)..."
if ssh -p "${SERVER_PORT}" "${SERVER_USER}@${SERVER_HOST}" "curl -fsS http://127.0.0.1:8090/health >/dev/null"; then
    echo "   ✅ Health check passed."
else
    echo "   ❌ Health check FAILED!"
    echo "   ⚠️  Immediate rollback NOT performed (images overwritten)."
    echo "   ⚠️  Please check server logs immediately."
    ssh -p "${SERVER_PORT}" "${SERVER_USER}@${SERVER_HOST}" "docker logs --tail 20 hotnews-viewer"
    exit 1
fi

# Check container status
echo "   Checking container status..."
ssh -p "${SERVER_PORT}" "${SERVER_USER}@${SERVER_HOST}" "docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' | grep hotnews"

echo "========================================"
echo "✅ Deploy Success!"
echo "========================================"
