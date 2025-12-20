#!/bin/bash
set -euo pipefail

SERVER_USER="root"
SERVER_HOST="120.77.222.205"
SSH_PORT="52222"
PROJECT_PATH="~/hotnews"

CONTROL_PATH="/tmp/hotnews-ssh-${SERVER_USER}@${SERVER_HOST}-${SSH_PORT}"
SSH_OPTS="-p ${SSH_PORT} -o ControlMaster=auto -o ControlPersist=600 -o ControlPath=${CONTROL_PATH}"
SCP_OPTS="-P ${SSH_PORT} -o ControlMaster=auto -o ControlPersist=600 -o ControlPath=${CONTROL_PATH}"

RESTART=true
DRY_RUN=false
ROLLBACK_TS=""

print_usage() {
  cat <<'USAGE'
Usage:
  hotfix-viewer.sh [--no-restart] [--dry-run] <file1> [file2 ...]
  hotfix-viewer.sh --rollback <timestamp> [--no-restart] [file1 ...]

Examples:
  hotfix-viewer.sh trendradar/web/templates/viewer.html
  hotfix-viewer.sh --no-restart trendradar/web/templates/viewer.html

Notes:
  - Only supports files under:
      trendradar/web/templates/
      trendradar/web/static/
      trendradar/web/
  - The script uploads files to the server and docker-cp into container: trend-radar-viewer
  - A backup is created on the server under ~/hotnews/hotfix_backups/<timestamp>/
USAGE
}

if [ $# -eq 0 ]; then
  print_usage
  exit 1
fi

FILES=()
while [ $# -gt 0 ]; do
  case "$1" in
    --no-restart)
      RESTART=false
      shift
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --rollback)
      shift
      if [ $# -eq 0 ]; then
        echo "❌ Missing value for --rollback <timestamp>"
        exit 1
      fi
      ROLLBACK_TS="$1"
      shift
      ;;
    -h|--help)
      print_usage
      exit 0
      ;;
    *)
      FILES+=("$1")
      shift
      ;;
  esac
done

if [ ${#FILES[@]} -eq 0 ]; then
  if [ -z "$ROLLBACK_TS" ]; then
    echo "❌ No files provided"
    exit 1
  fi
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

ts="$(date +%Y%m%d%H%M%S)"
remote="${SERVER_USER}@${SERVER_HOST}"
remote_tmp="/tmp/hotnews-hotfix-${ts}"

allow_prefix_ok() {
  local p="$1"
  case "$p" in
    trendradar/web/templates/*|trendradar/web/static/*|trendradar/web/*)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

for f in "${FILES[@]}"; do
  if [ ! -f "$f" ]; then
    echo "❌ File not found: $f"
    exit 1
  fi
  if ! allow_prefix_ok "$f"; then
    echo "❌ Refusing to hotfix file outside allowed paths: $f"
    exit 1
  fi
  if echo "$f" | grep -qE '(^|/)\.\.'; then
    echo "❌ Refusing suspicious path: $f"
    exit 1
  fi
done

if [ "$DRY_RUN" = "true" ]; then
  echo "DRY RUN: would hotfix files:"
  printf '  - %s\n' "${FILES[@]}"
  echo "DRY RUN: would upload to ${remote}:${remote_tmp}/ and docker cp into trend-radar-viewer"
  exit 0
fi

echo "📡 Testing SSH connection..."
ssh ${SSH_OPTS} -o ConnectTimeout=5 "$remote" "echo ok" >/dev/null

if [ -n "$ROLLBACK_TS" ]; then
  echo "↩️  Rolling back from backup timestamp: $ROLLBACK_TS"
  file_list=$(printf '%s\n' "${FILES[@]}")
  ssh ${SSH_OPTS} "$remote" "export ROLLBACK_TS='$ROLLBACK_TS' RESTART='$RESTART'; bash -s" <<ENDSSH
set -euo pipefail
PROJECT_PATH=~/hotnews
BACKUP_DIR="\$PROJECT_PATH/hotfix_backups/\$ROLLBACK_TS"

container_id=\$(docker ps -q -f name=^trend-radar-viewer\$ | head -n 1 || true)
if [ -z "\$container_id" ]; then
  echo "❌ trend-radar-viewer container is not running"
  exit 1
fi

if [ ! -d "\$BACKUP_DIR" ]; then
  echo "❌ Backup dir not found: \$BACKUP_DIR"
  exit 1
fi

restore_one() {
  local rel="\$1"
  local src_file="\$BACKUP_DIR/\$rel"
  local dst_in_container="/app/\$rel"
  if [ ! -f "\$src_file" ]; then
    echo "❌ Backup file not found: \$src_file"
    exit 1
  fi
  docker cp "\$src_file" "\$container_id:\$dst_in_container"
}

if [ -n "$file_list" ]; then
  while IFS= read -r rel; do
    [ -z "\$rel" ] && continue
    restore_one "\$rel"
  done <<'FILES'
${file_list}
FILES
else
  cd "\$BACKUP_DIR"
  while IFS= read -r f; do
    [ -z "\$f" ] && continue
    restore_one "\$f"
  done < <(find . -type f -print | sed 's#^\./##')
fi

if [ "\$RESTART" = "true" ]; then
  docker restart trend-radar-viewer >/dev/null
  for i in \$(seq 1 30); do
    if curl -fsS http://127.0.0.1:8090/health >/dev/null 2>&1; then
      echo "✅ viewer healthy"
      exit 0
    fi
    sleep 1
  done
  echo "❌ viewer health check failed after rollback"
  exit 1
fi
echo "✅ rollback done (no restart)"
ENDSSH

  echo "🎉 Rollback complete."
  exit 0
fi

echo "📁 Preparing remote temp dir: $remote_tmp"
ssh ${SSH_OPTS} "$remote" "mkdir -p '$remote_tmp'" >/dev/null

# Upload files
for f in "${FILES[@]}"; do
  dir="$(dirname "$f")"
  base="$(basename "$f")"
  ssh ${SSH_OPTS} "$remote" "mkdir -p '$remote_tmp/$dir'" >/dev/null
  scp ${SCP_OPTS} "$f" "$remote:$remote_tmp/$dir/$base" >/dev/null
  echo "⬆️  Uploaded: $f"
done

echo "🔧 Applying hotfix into container trend-radar-viewer..."
file_list=$(printf '%s\n' "${FILES[@]}")
ssh ${SSH_OPTS} "$remote" "export TS='$ts' REMOTE_TMP='$remote_tmp' RESTART='$RESTART'; bash -s" <<ENDSSH
set -euo pipefail
PROJECT_PATH=~/hotnews
BACKUP_DIR="\$PROJECT_PATH/hotfix_backups/\$TS"
container_id=\$(docker ps -q -f name=^trend-radar-viewer\$ | head -n 1 || true)
if [ -z "\$container_id" ]; then
  echo "❌ trend-radar-viewer container is not running"
  exit 1
fi
mkdir -p "\$BACKUP_DIR"
while IFS= read -r rel; do
  [ -z "\$rel" ] && continue
  src="\$REMOTE_TMP/\$rel"
  dst_in_container="/app/\$rel"
  backup_file="\$BACKUP_DIR/\$rel"
  mkdir -p "\$(dirname "\$backup_file")"
  if [ -f "\$src" ]; then
    docker cp "\$container_id:\$dst_in_container" "\$backup_file" >/dev/null 2>&1 || true
    docker cp "\$src" "\$container_id:\$dst_in_container"
  fi
done <<'FILES'
${file_list}
FILES
if [ "$RESTART" = "true" ]; then
  docker restart trend-radar-viewer >/dev/null
  for i in \$(seq 1 30); do
    if curl -fsS http://127.0.0.1:8090/health >/dev/null 2>&1; then
      echo "✅ viewer healthy"
      exit 0
    fi
    sleep 1
  done
  echo "❌ viewer health check failed after hotfix"
  exit 1
fi
echo "✅ hotfix done (no restart)"
ENDSSH

echo "🎉 Hotfix complete."
