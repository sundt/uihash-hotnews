#!/bin/bash
set -e

# ==============================================================================
# Sync Kernel Logic
# Usage: ./scripts/sync-kernel.sh "Commit message"
# ==============================================================================

# Default config (can be overridden by env vars)
# Compliant with AI_CONTEXT.md "Config Standards": Prefer os.environ
SERVER_USER="${HOTNEWS_SSH_USER:-root}"
SERVER_HOST="${HOTNEWS_SSH_HOST:-120.77.222.205}"
SERVER_PORT="${HOTNEWS_SSH_PORT:-52222}"
# Project root on server is ~/hotnews, so kernel path is ~/hotnews/hotnews/kernel/
SERVER_PROJECT_ROOT="${HOTNEWS_REMOTE_ROOT:-~/hotnews}"
SERVER_PATH="${SERVER_PROJECT_ROOT}/hotnews/kernel/"

# Load .env if it exists (to support local overriding)
if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
fi 

COMMIT_MSG="$1"

if [ -z "$COMMIT_MSG" ]; then
    echo "Usage: $0 \"Your commit message\""
    exit 1
fi

# Ensure we are at project root
if [ ! -d "hotnews/kernel" ]; then
    echo "Error: specific kernel directory 'hotnews/kernel' not found."
    echo "Please run this script from the project root."
    exit 1
fi

echo "========================================"
echo "🚀 Starting Kernel Sync"
echo "========================================"

# 1. Git Push (Kernel Submodule)
echo ">>> 📦 Creating git commit for hotnews/kernel..."
cd hotnews/kernel

# Add all changes
git add .

# Commit (allow empty if no changes, just to be safe, though usually we strictly want changes)
if git diff-index --quiet HEAD --; then
    echo "   (No local changes to commit in kernel)"
else
    git commit -m "$COMMIT_MSG"
    echo "   ✅ Committed."
fi

echo ">>> ☁️  Pushing hotnews/kernel to GitHub..."
# Try to push to main (adjust branch if needed)
git push origin main
echo "   ✅ Pushed to GitHub."

# Return to root
cd ../..


# 2. RSYNC to Server
echo "========================================"
echo ">>> 📡 Syncing files to Server (${SERVER_HOST})..."
# Safety check: Ensure we are not syncing an empty dir which would wipe the server
if [ -z "$(ls -A hotnews/kernel)" ]; then
   echo "Error: Local hotnews/kernel appears empty! Aborting rsync to prevent data loss."
   exit 1
fi

# --delete: remove files on server that are deleted locally
# -e: specify ssh port
rsync -avz --delete -e "ssh -p ${SERVER_PORT}" hotnews/kernel/ ${SERVER_USER}@${SERVER_HOST}:${SERVER_PATH}

echo "   ✅ Files synced."


# 3. Restart Viewer (Optional - Disabled by request)
# echo "========================================"
# echo ">>> 🔄 Restarting hotnews-viewer on server..."
# ssh -p ${SERVER_PORT} ${SERVER_USER}@${SERVER_HOST} "cd ~/hotnews/docker && docker compose -f docker-compose-build.yml restart hotnews-viewer"

echo "========================================"
echo "✅ Kernel Sync Completed (No Restart)!"
echo "========================================"
