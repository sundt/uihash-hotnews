#!/usr/bin/env bash
set -euo pipefail

SERVER_HOST="120.77.222.205"
SERVER_USER="root"
SSH_PORT="52222"

DEPLOY_PATH="/root/hotnews"
SERVICE_NAME="fastapi"

RESTART_MODE="docker"
DOCKER_COMPOSE_DIR="docker"
DOCKER_COMPOSE_SERVICE=""
CUSTOM_RESTART_CMD=""

DOCKER_BUILD_ON_DEPLOY="true"
DOCKER_RECREATE_ON_DEPLOY="true"
DOCKER_BUILD_COMPOSE_FILE="docker-compose-build.yml"
DOCKER_RUN_COMPOSE_FILE="docker-compose.yml"

DRY_RUN="false"
HEALTHCHECK_URL="http://127.0.0.1:8090/health"
HEALTHCHECK_RETRIES="30"
HEALTHCHECK_DELAY_SECONDS="1"

REMOTE_TMP_DIR="/tmp"
PACKAGE_BASENAME="release.tar.gz"

UPDATE_DEPS="false"
PIP_PYTHON="python3"

KEEP_BACKUPS_DAYS="3"

COLOR_RESET="\033[0m"
COLOR_GREEN="\033[32m"
COLOR_RED="\033[31m"
COLOR_YELLOW="\033[33m"
COLOR_BLUE="\033[34m"

log_info() { printf "%b🟢 [INFO] %s%b\n" "${COLOR_GREEN}" "$*" "${COLOR_RESET}"; }
log_warn() { printf "%b🟡 [WARN] %s%b\n" "${COLOR_YELLOW}" "$*" "${COLOR_RESET}"; }
log_err()  { printf "%b🔴 [ERROR] %s%b\n" "${COLOR_RED}" "$*" "${COLOR_RESET}" >&2; }

print_usage() {
  cat <<'USAGE'
Usage:
  bash deploy_tar.sh [--dry-run] [--update-deps] [--healthcheck-url URL]

Notes:
  - Fill SERVER_HOST / SERVER_USER / DEPLOY_PATH / SERVICE_NAME at the top of this script.
  - --dry-run will upload and extract on server, but will NOT swap directories or restart services.
USAGE
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --dry-run)
      DRY_RUN="true"
      shift
      ;;
    --update-deps)
      UPDATE_DEPS="true"
      shift
      ;;
    --healthcheck-url)
      HEALTHCHECK_URL="${2:-}"
      shift 2
      ;;
    -h|--help)
      print_usage
      exit 0
      ;;
    *)
      log_err "Unknown arg: $1"
      print_usage
      exit 1
      ;;
  esac
done

if [ -z "${SERVER_HOST}" ]; then
  log_err "SERVER_HOST is empty. Please set it at the top of the script."
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${SCRIPT_DIR}"

if ! command -v tar >/dev/null 2>&1; then
  log_err "tar not found on local machine"
  exit 1
fi

if ! command -v ssh >/dev/null 2>&1; then
  log_err "ssh not found on local machine"
  exit 1
fi

if ! command -v scp >/dev/null 2>&1; then
  log_err "scp not found on local machine"
  exit 1
fi

REMOTE="${SERVER_USER}@${SERVER_HOST}"
SSH_OPTS=(
  -p "${SSH_PORT}"
  -o ControlMaster=auto
  -o ControlPersist=600
  -o ControlPath="/tmp/hotnews-deploy-ssh-${SERVER_USER}@${SERVER_HOST}-${SSH_PORT}"
)

TS_LOCAL="$(date +%Y%m%d_%H%M%S)"
PACKAGE_LOCAL="${SCRIPT_DIR}/${PACKAGE_BASENAME}"
PACKAGE_REMOTE="${REMOTE_TMP_DIR}/${PACKAGE_BASENAME%.tar.gz}_${TS_LOCAL}.tar.gz"

log_info "Packaging project -> ${PACKAGE_LOCAL}"
rm -f "${PACKAGE_LOCAL}"

tar_extra=()
if tar --version 2>/dev/null | grep -qiE 'bsdtar|libarchive'; then
  tar_extra+=(--no-xattrs --no-mac-metadata)
fi

COPYFILE_DISABLE=1 COPY_EXTENDED_ATTRIBUTES_DISABLE=1 tar -czf "${PACKAGE_LOCAL}" "${tar_extra[@]}" \
  --exclude "./${PACKAGE_BASENAME}" \
  --exclude "./.git" \
  --exclude "./.git/" \
  --exclude "./venv" \
  --exclude "./venv/" \
  --exclude "./.venv" \
  --exclude "./.venv/" \
  --exclude "./__pycache__" \
  --exclude "./__pycache__/" \
  --exclude "./.DS_Store" \
  --exclude "./node_modules" \
  --exclude "./node_modules/" \
  --exclude "./playwright-report" \
  --exclude "./playwright-report/" \
  --exclude "./test-results" \
  --exclude "./test-results/" \
  --exclude "./logs" \
  --exclude "./logs/" \
  --exclude "./rss_feeds.csv" \
  --exclude "./rss_feeds_manual_additions.csv" \
  --exclude "./RSSrequirement.txt" \
  --exclude "./output" \
  --exclude "./output/" \
  --exclude "./.playwright" \
  --exclude "./.playwright/" \
  --exclude "./*.pyc" \
  .

if [ ! -f "${PACKAGE_LOCAL}" ]; then
  log_err "Packaging failed: ${PACKAGE_LOCAL} not created"
  exit 1
fi

log_info "Uploading package -> ${REMOTE}:${PACKAGE_REMOTE}"
scp "-P" "${SSH_PORT}" "${PACKAGE_LOCAL}" "${REMOTE}:${PACKAGE_REMOTE}"

log_info "Deploying on remote host"
ssh "${SSH_OPTS[@]}" "${REMOTE}" bash -s -- \
  "${DEPLOY_PATH}" \
  "${SERVICE_NAME}" \
  "${PACKAGE_REMOTE}" \
  "${DRY_RUN}" \
  "${UPDATE_DEPS}" \
  "${PIP_PYTHON}" \
  "${KEEP_BACKUPS_DAYS}" \
  "${HEALTHCHECK_URL}" \
  "${HEALTHCHECK_RETRIES}" \
  "${HEALTHCHECK_DELAY_SECONDS}" \
  "${RESTART_MODE}" \
  "${DOCKER_COMPOSE_DIR}" \
  "${DOCKER_COMPOSE_SERVICE}" \
  "${CUSTOM_RESTART_CMD}" \
  "${DOCKER_BUILD_ON_DEPLOY}" \
  "${DOCKER_RECREATE_ON_DEPLOY}" \
  "${DOCKER_BUILD_COMPOSE_FILE}" \
  "${DOCKER_RUN_COMPOSE_FILE}" <<'ENDSSH'
set -euo pipefail

DEPLOY_PATH="$1"
SERVICE_NAME="$2"
PACKAGE_REMOTE="$3"
DRY_RUN="$4"
UPDATE_DEPS="$5"
PIP_PYTHON="$6"
KEEP_BACKUPS_DAYS="$7"
HEALTHCHECK_URL="$8"
HEALTHCHECK_RETRIES="${9:-30}"
HEALTHCHECK_DELAY_SECONDS="${10:-1}"
RESTART_MODE="${11:-systemctl}"
DOCKER_COMPOSE_DIR="${12:-docker}"
DOCKER_COMPOSE_SERVICE="${13-}"
CUSTOM_RESTART_CMD="${14-}"
DOCKER_BUILD_ON_DEPLOY="${15:-false}"
DOCKER_RECREATE_ON_DEPLOY="${16:-false}"
DOCKER_BUILD_COMPOSE_FILE="${17:-docker-compose-build.yml}"
DOCKER_RUN_COMPOSE_FILE="${18:-docker-compose.yml}"

COLOR_RESET="\033[0m"
COLOR_GREEN="\033[32m"
COLOR_RED="\033[31m"
COLOR_YELLOW="\033[33m"

log_info() { printf "%b🟢 [INFO] %s%b\n" "${COLOR_GREEN}" "$*" "${COLOR_RESET}"; }
log_warn() { printf "%b🟡 [WARN] %s%b\n" "${COLOR_YELLOW}" "$*" "${COLOR_RESET}"; }
log_err()  { printf "%b🔴 [ERROR] %s%b\n" "${COLOR_RED}" "$*" "${COLOR_RESET}" >&2; }

if [ ! -f "${PACKAGE_REMOTE}" ]; then
  log_err "Package not found on server: ${PACKAGE_REMOTE}"
  exit 1
fi

TS_REMOTE="$(date +%Y%m%d_%H%M%S)"
NEW_DIR="/tmp/project_new_${TS_REMOTE}"
BACKUP_DIR=""
PARENT_DIR="$(dirname "${DEPLOY_PATH}")"
BASE_NAME="$(basename "${DEPLOY_PATH}")"

rollback() {
  log_warn "Rolling back..."
  if [ -n "${BACKUP_DIR}" ] && [ -d "${BACKUP_DIR}" ]; then
    if [ -d "${DEPLOY_PATH}" ]; then
      rm -rf "${DEPLOY_PATH}"
    fi
    mv "${BACKUP_DIR}" "${DEPLOY_PATH}"
    case "${RESTART_MODE}" in
      systemctl)
        if command -v systemctl >/dev/null 2>&1 && systemctl list-unit-files --type=service 2>/dev/null | grep -qE "^${SERVICE_NAME}\\.service\\b"; then
          systemctl restart "${SERVICE_NAME}" || true
        fi
        ;;
      docker)
        if [ -d "${DEPLOY_PATH}/${DOCKER_COMPOSE_DIR}" ]; then
          cd "${DEPLOY_PATH}/${DOCKER_COMPOSE_DIR}" || true
          if docker compose version >/dev/null 2>&1; then
            if [ -n "${DOCKER_COMPOSE_SERVICE}" ]; then
              docker compose restart "${DOCKER_COMPOSE_SERVICE}" || true
            else
              docker compose restart || true
            fi
          elif command -v docker-compose >/dev/null 2>&1; then
            if [ -n "${DOCKER_COMPOSE_SERVICE}" ]; then
              docker-compose restart "${DOCKER_COMPOSE_SERVICE}" || true
            else
              docker-compose restart || true
            fi
          fi
        fi
        ;;
      custom)
        if [ -n "${CUSTOM_RESTART_CMD}" ]; then
          bash -lc "${CUSTOM_RESTART_CMD}" || true
        fi
        ;;
    esac
    log_info "Rollback finished"
    return 0
  fi
  log_warn "No backup directory to rollback"
  return 0
}

restart_service() {
  case "${RESTART_MODE}" in
    systemctl)
      if ! command -v systemctl >/dev/null 2>&1; then
        log_err "systemctl not found"
        return 1
      fi
      if ! systemctl list-unit-files --type=service 2>/dev/null | grep -qE "^${SERVICE_NAME}\\.service\\b"; then
        log_err "systemd unit not found: ${SERVICE_NAME}.service"
        return 1
      fi
      log_info "Restarting service (systemctl): ${SERVICE_NAME}"
      systemctl restart "${SERVICE_NAME}"
      systemctl is-active --quiet "${SERVICE_NAME}"
      return 0
      ;;
    docker)
      if [ -z "${DOCKER_COMPOSE_DIR}" ]; then
        log_err "DOCKER_COMPOSE_DIR is empty"
        return 1
      fi
      if [ ! -d "${DEPLOY_PATH}/${DOCKER_COMPOSE_DIR}" ]; then
        log_err "docker compose dir not found: ${DEPLOY_PATH}/${DOCKER_COMPOSE_DIR}"
        return 1
      fi
      cd "${DEPLOY_PATH}/${DOCKER_COMPOSE_DIR}"
      compose_cmd=()
      if docker compose version >/dev/null 2>&1; then
        compose_cmd=(docker compose)
      elif command -v docker-compose >/dev/null 2>&1; then
        compose_cmd=(docker-compose)
      else
        log_err "docker compose not found"
        return 1
      fi

      if [ "${DOCKER_BUILD_ON_DEPLOY}" = "true" ]; then
        if [ -f "${DOCKER_BUILD_COMPOSE_FILE}" ]; then
          if [ -n "${DOCKER_COMPOSE_SERVICE}" ]; then
            log_info "Building via compose: ${DOCKER_COMPOSE_SERVICE}"
            "${compose_cmd[@]}" -f "${DOCKER_BUILD_COMPOSE_FILE}" build "${DOCKER_COMPOSE_SERVICE}"
          else
            log_info "Building via compose (all services)"
            "${compose_cmd[@]}" -f "${DOCKER_BUILD_COMPOSE_FILE}" build
          fi
        else
          log_warn "Build compose file not found: ${DOCKER_BUILD_COMPOSE_FILE} (skip build)"
        fi
      fi

      if [ "${DOCKER_RECREATE_ON_DEPLOY}" = "true" ]; then
        if [ -f "${DOCKER_RUN_COMPOSE_FILE}" ]; then
          if [ -n "${DOCKER_COMPOSE_SERVICE}" ]; then
            log_info "Recreating via compose: ${DOCKER_COMPOSE_SERVICE}"
            "${compose_cmd[@]}" -f "${DOCKER_RUN_COMPOSE_FILE}" up -d --no-deps --force-recreate "${DOCKER_COMPOSE_SERVICE}"
          else
            log_info "Recreating via compose (all services)"
            "${compose_cmd[@]}" -f "${DOCKER_RUN_COMPOSE_FILE}" up -d --force-recreate
          fi
        else
          log_err "Run compose file not found: ${DOCKER_RUN_COMPOSE_FILE}"
          return 1
        fi
        return 0
      fi

      if [ -n "${DOCKER_COMPOSE_SERVICE}" ]; then
        log_info "Restarting via compose: ${DOCKER_COMPOSE_SERVICE}"
        "${compose_cmd[@]}" restart "${DOCKER_COMPOSE_SERVICE}"
      else
        log_info "Restarting via compose (all services)"
        "${compose_cmd[@]}" restart
      fi
      return 0
      ;;
    custom)
      if [ -z "${CUSTOM_RESTART_CMD}" ]; then
        log_err "CUSTOM_RESTART_CMD is empty"
        return 1
      fi
      log_info "Restarting via custom command"
      bash -lc "${CUSTOM_RESTART_CMD}"
      return 0
      ;;
    *)
      log_err "Unknown RESTART_MODE: ${RESTART_MODE} (expected: systemctl|docker|custom)"
      return 1
      ;;
  esac
}

log_info "Extracting package -> ${NEW_DIR}"
rm -rf "${NEW_DIR}"
mkdir -p "${NEW_DIR}"

tar -xzf "${PACKAGE_REMOTE}" -C "${NEW_DIR}"

if [ "${DRY_RUN}" = "true" ]; then
  log_info "dry-run: extract ok, skipping swap/restart"
  rm -f "${PACKAGE_REMOTE}" || true
  rm -rf "${NEW_DIR}" || true
  exit 0
fi

log_info "Swapping directories"
if [ -d "${DEPLOY_PATH}" ]; then
  BACKUP_DIR="${DEPLOY_PATH}_backup_${TS_REMOTE}"
  mv "${DEPLOY_PATH}" "${BACKUP_DIR}"
fi

if mv "${NEW_DIR}" "${DEPLOY_PATH}"; then
  :
else
  log_warn "mv failed (possible cross-device move). Falling back to copy method."
  mkdir -p "${DEPLOY_PATH}"
  if command -v rsync >/dev/null 2>&1; then
    rsync -a --delete "${NEW_DIR}/" "${DEPLOY_PATH}/" || { log_err "rsync copy failed"; rollback; exit 1; }
  else
    cp -a "${NEW_DIR}/." "${DEPLOY_PATH}/" || { log_err "cp copy failed"; rollback; exit 1; }
  fi
  rm -rf "${NEW_DIR}" || true
fi

if [ "${UPDATE_DEPS}" = "true" ]; then
  if [ -f "${DEPLOY_PATH}/requirements.txt" ]; then
    log_info "Updating dependencies"
    (cd "${DEPLOY_PATH}" && "${PIP_PYTHON}" -m pip install -r requirements.txt) || { log_err "Dependency update failed"; rollback; exit 1; }
  else
    log_warn "requirements.txt not found, skipping dependency update"
  fi
fi

restart_service || { log_err "Service restart failed"; rollback; exit 1; }

if [ -n "${HEALTHCHECK_URL}" ]; then
  if ! command -v curl >/dev/null 2>&1; then
    log_err "curl not found, cannot health check: ${HEALTHCHECK_URL}"
    rollback
    exit 1
  fi
  log_info "Health checking: ${HEALTHCHECK_URL}"
  ok="false"
  for i in $(seq 1 "${HEALTHCHECK_RETRIES}"); do
    if curl -fsS "${HEALTHCHECK_URL}" >/dev/null 2>&1; then
      ok="true"
      break
    fi
    sleep "${HEALTHCHECK_DELAY_SECONDS}"
  done
  if [ "${ok}" != "true" ]; then
    log_err "Health check failed"
    rollback
    exit 1
  fi
  log_info "Health check ok"
else
  log_warn "HEALTHCHECK_URL is empty, skipping health check"
fi

log_info "Cleaning up remote package"
rm -f "${PACKAGE_REMOTE}"

if [ "${KEEP_BACKUPS_DAYS}" -gt 0 ] 2>/dev/null; then
  log_info "Removing backups older than ${KEEP_BACKUPS_DAYS} days"
  if [ -d "${PARENT_DIR}" ]; then
    find "${PARENT_DIR}" -maxdepth 1 -type d -name "${BASE_NAME}_backup_*" -mtime "+${KEEP_BACKUPS_DAYS}" -exec rm -rf {} + || true
  fi
fi

log_info "Deploy finished"
ENDSSH

log_info "Done"
