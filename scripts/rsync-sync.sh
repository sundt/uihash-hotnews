#!/usr/bin/env bash
set -euo pipefail

SERVER_USER="root"
SERVER_HOST="120.77.222.205"
SSH_PORT="52222"
PROJECT_PATH="~/hotnews"

DRY_RUN=false
INCLUDE_CONFIG=false
RESTART=false
DELETE_REMOTE=false

BACKUP_REMOTE=true
BACKUP_TS=""
BACKUP_DIR=""

print_usage() {
  cat <<'USAGE'
Usage:
  bash rsync-sync.sh [--dry-run] [--include-config] [--restart] [--delete]

What it does:
  - Rsync project code to the server (incremental)
  - By default does NOT sync config/ and output/

Options:
  --dry-run        Preview what would be transferred
  --include-config Also sync ./config/
  --restart        Restart viewer on the server after sync (docker compose or systemctl)
  --delete         Delete remote files not present locally (DANGEROUS)

Examples:
  bash rsync-sync.sh --dry-run
  bash rsync-sync.sh
  bash rsync-sync.sh --include-config --restart
USAGE
}

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=true ;;
    --include-config) INCLUDE_CONFIG=true ;;
    --restart) RESTART=true ;;
    --delete) DELETE_REMOTE=true ;;
    --no-backup) BACKUP_REMOTE=false ;;
    -h|--help) print_usage; exit 0 ;;
    *)
      echo "❌ Unknown arg: $arg"
      print_usage
      exit 1
      ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if ! command -v rsync >/dev/null 2>&1; then
  echo "❌ rsync not found on local machine"
  exit 1
fi

remote="${SERVER_USER}@${SERVER_HOST}"
ssh_opts=(
  -p "${SSH_PORT}"
  -o ControlMaster=auto
  -o ControlPersist=600
  -o ControlPath="/tmp/hotnews-ssh-${SERVER_USER}@${SERVER_HOST}-${SSH_PORT}"
)

if ! ssh "${ssh_opts[@]}" -o ConnectTimeout=5 "$remote" "command -v rsync >/dev/null 2>&1"; then
  echo "❌ rsync not found on server (or ssh failed): $remote"
  exit 1
fi

# Ensure remote path exists (expand ~)
remote_path_expanded=$(ssh "${ssh_opts[@]}" -o ConnectTimeout=5 "$remote" "eval echo ${PROJECT_PATH}")
if [ -z "${remote_path_expanded}" ]; then
  echo "❌ Failed to resolve remote path: ${PROJECT_PATH}"
  exit 1
fi
ssh "${ssh_opts[@]}" -o ConnectTimeout=5 "$remote" "mkdir -p '${remote_path_expanded}'" >/dev/null

rollback_remote() {
  if [ -z "${BACKUP_DIR}" ]; then
    return 0
  fi
  echo "↩️  Rolling back from remote backup: ${BACKUP_DIR}/backup.tgz"
  ssh "${ssh_opts[@]}" "$remote" bash -s -- "${remote_path_expanded}" "${BACKUP_DIR}" "${RESTART}" <<'ENDSSH'
set -euo pipefail

remote_path_expanded="$1"
backup_dir="$2"
restart="$3"

cd "${remote_path_expanded}"
if [ ! -f "${backup_dir}/backup.tgz" ]; then
  echo "❌ backup archive not found: ${backup_dir}/backup.tgz"
  exit 1
fi

tar -xzf "${backup_dir}/backup.tgz" -C "${remote_path_expanded}"

if [ "${restart}" = "true" ]; then
  if [ -f docker/docker-compose.yml ] || [ -f docker/docker-compose.build.yml ] || [ -f docker/docker-compose-build.yml ]; then
    cd docker
    if docker compose version >/dev/null 2>&1; then
      docker compose restart hotnews-viewer || docker compose restart
    elif command -v docker-compose >/dev/null 2>&1; then
      docker-compose restart hotnews-viewer || docker-compose restart
    fi
  fi
fi

for i in {1..30}; do
  if curl -fsS http://127.0.0.1:8090/health >/dev/null 2>&1; then
    echo "✅ viewer healthy (after rollback)"
    exit 0
  fi
  sleep 1
done
echo "❌ viewer health check failed after rollback"
exit 1
ENDSSH
}

on_error() {
  local code=$?
  if [ "${DRY_RUN}" = "true" ]; then
    exit "$code"
  fi
  if [ "${BACKUP_REMOTE}" = "true" ]; then
    rollback_remote || true
  fi
  exit "$code"
}

trap on_error ERR

if [ "${DRY_RUN}" != "true" ] && [ "${BACKUP_REMOTE}" = "true" ]; then
  BACKUP_TS=$(date +%Y%m%d%H%M%S)
  BACKUP_DIR="${remote_path_expanded}/rsync_backups/${BACKUP_TS}"
  echo "🧰 Creating remote backup: ${BACKUP_DIR}/backup.tgz"
  ssh "${ssh_opts[@]}" "$remote" bash -s -- "${remote_path_expanded}" "${BACKUP_DIR}" <<'ENDSSH'
set -euo pipefail

remote_path_expanded="$1"
backup_dir="$2"

cd "${remote_path_expanded}"
mkdir -p "${backup_dir}"

files=()
for p in hotnews docker mcp_server openspec README.md; do
  if [ -e "${p}" ]; then
    files+=("${p}")
  fi
done
for s in ./*.sh; do
  if [ -e "${s}" ]; then
    files+=("${s#./}")
  fi
done
if [ "${#files[@]}" -eq 0 ]; then
  echo "❌ nothing to backup under ${remote_path_expanded}"
  exit 1
fi

tar -czf "${backup_dir}/backup.tgz" "${files[@]}"
ENDSSH
  echo "✅ remote backup created: ${BACKUP_DIR}/backup.tgz"
fi

rsync_args=(
  -a
  -e "ssh ${ssh_opts[*]}"
)

if [ "$DRY_RUN" != "true" ]; then
  rsync_args+=(
    -vz
    --progress
  )
else
  rsync_args+=(
    --itemize-changes
    --stats
  )
fi

if [ "$DRY_RUN" = "true" ]; then
  rsync_args+=(--dry-run)
fi

if [ "$DELETE_REMOTE" = "true" ]; then
  rsync_args+=(--delete)
fi

# Common excludes
rsync_args+=(
  --exclude ".git/"
  --exclude "node_modules/"
  --exclude "playwright-report/"
  --exclude "test-results/"
  --exclude ".playwright/"
  --exclude "__pycache__/"
  --exclude "*.pyc"
  --exclude ".DS_Store"
  --exclude "output/"
)

# Default sync set
sources=(
  "./hotnews"
  "./docker"
  "./mcp_server"
  "./openspec"
  "./README.md"
  "./index.html"
  "./predeploy-cache-bust.py"
)

shopt -s nullglob
sh_files=(./*.sh)
shopt -u nullglob
if [ ${#sh_files[@]} -gt 0 ]; then
  sources+=("${sh_files[@]}")
fi

if [ "$INCLUDE_CONFIG" = "true" ]; then
  sources+=("./config/")
else
  rsync_args+=(--exclude "config/")
fi

if [ ! -f "./index.html" ]; then
  echo "❌ index.html not found in project root"
  exit 1
fi
if [ ! -f "./hotnews/web/templates/viewer.html" ]; then
  echo "❌ viewer.html not found: ./hotnews/web/templates/viewer.html"
  exit 1
fi
if [ ! -f "./predeploy-cache-bust.py" ]; then
  echo "❌ predeploy-cache-bust.py not found in project root"
  exit 1
fi
if ! command -v python3 >/dev/null 2>&1; then
  echo "❌ python3 not found on local machine"
  exit 1
fi

if [ "$DRY_RUN" != "true" ] && command -v npm >/dev/null 2>&1 && [ -f "./package.json" ]; then
  npm run -s build:js --if-present
fi

echo "🧩 Pre-deploy cache busting index.html..."
if [ "$DRY_RUN" = "true" ]; then
  python3 ./predeploy-cache-bust.py --file ./index.html --file ./hotnews/web/templates/viewer.html --dry-run
else
  python3 ./predeploy-cache-bust.py --file ./index.html --file ./hotnews/web/templates/viewer.html
fi

echo "🚀 rsync -> ${remote}:${remote_path_expanded}"
rsync "${rsync_args[@]}" "${sources[@]}" "${remote}:${remote_path_expanded}/"

if [ "$RESTART" = "true" ]; then
  echo "🔄 Restarting viewer on server..."
  ssh "${ssh_opts[@]}" "$remote" bash -s -- "${remote_path_expanded}" <<'ENDSSH'
set -e

remote_path_expanded="$1"
cd "${remote_path_expanded}"

if [ -f docker/docker-compose.yml ] || [ -f docker/docker-compose.build.yml ] || [ -f docker/docker-compose-build.yml ]; then
  cd docker
  if docker compose version >/dev/null 2>&1; then
    if [ -f docker-compose-build.yml ]; then
      docker compose -f docker-compose-build.yml build hotnews-viewer
    elif [ -f docker-compose.build.yml ]; then
      docker compose -f docker-compose.build.yml build hotnews-viewer
    fi

    if [ -f docker-compose.yml ]; then
      docker compose -f docker-compose.yml up -d --force-recreate --no-deps hotnews-viewer
    else
      docker compose up -d --force-recreate --no-deps hotnews-viewer
    fi
  elif command -v docker-compose >/dev/null 2>&1; then
    if [ -f docker-compose-build.yml ]; then
      docker-compose -f docker-compose-build.yml build hotnews-viewer
    elif [ -f docker-compose.build.yml ]; then
      docker-compose -f docker-compose.build.yml build hotnews-viewer
    fi

    if [ -f docker-compose.yml ]; then
      docker-compose -f docker-compose.yml up -d --force-recreate --no-deps hotnews-viewer
    else
      docker-compose up -d --force-recreate --no-deps hotnews-viewer
    fi
  else
    echo "No docker compose found"
    exit 1
  fi
elif command -v systemctl >/dev/null 2>&1; then
  systemctl restart hotnews || true
else
  echo "No known restart method (docker compose/systemctl)"
  exit 1
fi
ENDSSH
  echo "✅ restart done"

  echo "🏥 Health checking viewer..."
  if ! ssh "${ssh_opts[@]}" "$remote" bash -s <<'ENDSSH'; then
set -e
for i in {1..30}; do
  if curl -fsS http://127.0.0.1:8090/health >/dev/null 2>&1; then
    echo "✅ viewer healthy"
    exit 0
  fi
  sleep 1
done
echo "❌ viewer health check failed"
exit 1
ENDSSH
    rollback_remote
    exit 1
  fi
fi

echo "✅ sync done"
