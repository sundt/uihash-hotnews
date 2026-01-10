#!/usr/bin/env bash
set -euo pipefail

# Ensure a UTF-8 locale for reliable non-ASCII (e.g. Chinese) commit messages.
if [ -z "${LANG:-}" ]; then
  export LANG="en_US.UTF-8"
fi
if [ -z "${LC_ALL:-}" ]; then
  export LC_ALL="$LANG"
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

BRANCH="main"
REMOTE_ORIGIN="origin"
REMOTE_GITEE="gitee"

SERVER_USER="root"
SERVER_HOST="120.77.222.205"
SSH_PORT="52222"
PROJECT_PATH="~/hotnews"

DRY_RUN=false
INCLUDE_DOCS=false
COMMIT_MSG=""

CHANGED_FILES=()
DEPLOY_FILES=()
IGNORED_FILES=()

print_usage() {
  cat <<'USAGE'
Usage:
  bash deploy-rebuild.sh [--dry-run] [--include-docs] [--message <msg>]

Workflow:
  1) Show local changes
  2) git add .
  3) Ask for commit message and git commit
  4) git push origin main
  5) git push gitee main
  6) SSH to server, git pull origin main
  7) docker compose build/up 3 services
  8) On failure, rollback and rebuild
  9) On success, health check + docker ps check

Notes:
  - SSH password will be prompted by ssh if needed.
  - If your terminal sometimes has issues entering Chinese interactively,
    prefer: --message "中文提交说明"
USAGE
}

while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --include-docs)
      INCLUDE_DOCS=true
      shift
      ;;
    --message)
      shift
      if [ $# -eq 0 ]; then
        echo "ERROR: Missing value for --message <msg>"
        exit 1
      fi
      COMMIT_MSG="$1"
      shift
      ;;
    -h|--help)
      print_usage
      exit 0
      ;;
    *)
      echo "ERROR: Unknown arg: $1"
      print_usage
      exit 1
      ;;
  esac
done

run() {
  echo "+ $*"
  if [ "$DRY_RUN" = "true" ]; then
    return 0
  fi
  "$@"
}

if ! command -v git >/dev/null 2>&1; then
  echo "ERROR: git not found"
  exit 1
fi

if ! git remote get-url "${REMOTE_ORIGIN}" >/dev/null 2>&1; then
  echo "ERROR: git remote not found: ${REMOTE_ORIGIN}"
  exit 1
fi
if ! git remote get-url "${REMOTE_GITEE}" >/dev/null 2>&1; then
  echo "ERROR: git remote not found: ${REMOTE_GITEE}"
  exit 1
fi

if [ ! -d .git ]; then
  echo "ERROR: Not a git repository: $SCRIPT_DIR"
  exit 1
fi

is_doc_like() {
  local f="$1"
  case "$f" in
    docs/*|openspec/*|*.md)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

collect_changed_files() {
  tmp_list=$(mktemp -t hotnews-deploy-rebuild.XXXXXX)
  trap 'rm -f "$tmp_list"' EXIT

  {
    git diff --name-only
    git diff --name-only --cached
    git ls-files --others --exclude-standard
  } | sed '/^$/d' | sort -u >"$tmp_list"

  CHANGED_FILES=()
  while IFS= read -r f; do
    [ -z "$f" ] && continue
    CHANGED_FILES+=("$f")
  done <"$tmp_list"
}

filter_files_for_commit() {
  DEPLOY_FILES=()
  IGNORED_FILES=()

  for f in "${CHANGED_FILES[@]}"; do
    if [ "$INCLUDE_DOCS" = "false" ] && is_doc_like "$f"; then
      IGNORED_FILES+=("$f")
    else
      DEPLOY_FILES+=("$f")
    fi
  done
}

collect_changed_files
filter_files_for_commit

if [ ${#CHANGED_FILES[@]} -eq 0 ]; then
  echo "No local changes detected. Nothing to commit/deploy."
  exit 0
fi

if [ ${#DEPLOY_FILES[@]} -eq 0 ]; then
  if [ "$INCLUDE_DOCS" = "false" ]; then
    echo "Only doc-like changes detected (docs/openspec/*.md). Nothing to commit/deploy."
    echo "If you want to include docs in the commit, re-run with: --include-docs"
    exit 0
  fi
  echo "No commit-relevant files detected."
  exit 0
fi

echo "Local changes to be committed:"
printf '  - %s\n' "${DEPLOY_FILES[@]}"
if [ "$INCLUDE_DOCS" = "false" ] && [ ${#IGNORED_FILES[@]} -gt 0 ]; then
  echo "Ignoring ${#IGNORED_FILES[@]} doc-like file(s) (use --include-docs to include)"
fi
echo ""

git diff --stat -- "${DEPLOY_FILES[@]}" || true
echo ""

read -r -p "Show full diff? [y/N] " show_diff
if [ "${show_diff:-}" = "y" ] || [ "${show_diff:-}" = "Y" ]; then
  git diff -- "${DEPLOY_FILES[@]}" || true
fi

commit_msg="$COMMIT_MSG"
if [ -z "${commit_msg}" ]; then
  printf '%s' "Commit message: "
  IFS= read -r commit_msg
fi
if [ -z "${commit_msg}" ]; then
  echo "ERROR: commit message cannot be empty"
  exit 1
fi

run git add -A -- "${DEPLOY_FILES[@]}"

if [ "$DRY_RUN" = "true" ]; then
  echo "DRY RUN: would commit with message: ${commit_msg}"
else
  if ! git commit -m "${commit_msg}"; then
    echo "ERROR: git commit failed"
    exit 1
  fi
fi

echo "Pushing to ${REMOTE_ORIGIN}/${BRANCH}..."
run git push "${REMOTE_ORIGIN}" "HEAD:${BRANCH}"

echo "Pushing to ${REMOTE_GITEE}/${BRANCH}..."
run git push "${REMOTE_GITEE}" "HEAD:${BRANCH}"

if [ "$DRY_RUN" = "true" ]; then
  echo "DRY RUN: would SSH to ${SERVER_USER}@${SERVER_HOST}:${SSH_PORT} and rebuild 3 services"
  exit 0
fi

ssh_opts=(
  -p "${SSH_PORT}"
  -o ControlMaster=auto
  -o ControlPersist=600
  -o ControlPath="/tmp/hotnews-ssh-${SERVER_USER}@${SERVER_HOST}-${SSH_PORT}"
)

remote="${SERVER_USER}@${SERVER_HOST}"

remote_path_expanded=$(ssh "${ssh_opts[@]}" -o ConnectTimeout=5 "$remote" "eval echo ${PROJECT_PATH}")
if [ -z "${remote_path_expanded}" ]; then
  echo "ERROR: Failed to resolve remote path: ${PROJECT_PATH}"
  exit 1
fi

echo "Rebuilding on server..."

ssh "${ssh_opts[@]}" "$remote" bash -s -- "${remote_path_expanded}" "${BRANCH}" "${DRY_RUN}" <<'ENDSSH'
set -euo pipefail

remote_path="$1"
branch="$2"
dry_run="$3"

run() {
  echo "+ $*"
  if [ "${dry_run}" = "true" ]; then
    return 0
  fi
  "$@"
}

verify() {
  ok=0
  for i in $(seq 1 60); do
    if curl -fsS http://127.0.0.1:8090/health >/dev/null 2>&1; then
      ok=1
      break
    fi
    sleep 1
  done

  if [ "${ok}" -ne 1 ]; then
    echo "ERROR: viewer health check failed"
    docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' || true
    echo "--- viewer logs (tail) ---"
    docker logs --tail 200 trend-radar-viewer 2>&1 || true
    exit 1
  fi

  run curl -fsS http://127.0.0.1:8090/health
  if [ "${dry_run}" != "true" ]; then
    echo ""
  fi
  run docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'

  if [ "${dry_run}" != "true" ]; then
    missing=0
    for n in trend-radar trend-radar-viewer trend-radar-mcp; do
      if ! docker ps --format '{{.Names}}' | grep -x "${n}" >/dev/null 2>&1; then
        echo "ERROR: container not running: ${n}"
        missing=1
      fi
    done
    if [ "${missing}" -ne 0 ]; then
      exit 1
    fi
  fi
}

rebuild_all() {
  cd "${remote_path}/docker"
  run docker compose -f docker-compose-build.yml build trend-radar trend-radar-viewer trend-radar-mcp
  run docker compose -f docker-compose-build.yml up -d --force-recreate trend-radar trend-radar-viewer trend-radar-mcp
}

rollback_attempted=0
old_head=""

on_err() {
  code=$?

  if [ "${dry_run}" = "true" ]; then
    exit "$code"
  fi

  if [ "${rollback_attempted}" -eq 1 ]; then
    echo "ERROR: deploy failed and rollback also failed"
    exit "$code"
  fi

  rollback_attempted=1
  echo "ERROR: deploy failed; rolling back..."

  if [ -n "${old_head}" ]; then
    set +e
    git reset --hard "${old_head}"
    rb_rc=$?
    set -e
    if [ "${rb_rc}" -ne 0 ]; then
      echo "ERROR: git reset rollback failed"
      exit "$code"
    fi

    rebuild_all
    verify
    echo "Rollback succeeded (deployment failed)."
  else
    echo "ERROR: old_head not recorded, cannot rollback"
  fi

  exit "$code"
}

trap on_err ERR

cd "${remote_path}"

if [ -n "$(git status --porcelain)" ]; then
  echo "ERROR: Server repo has local modifications. Please clean it before deploy."
  git status --porcelain
  exit 1
fi

run git fetch --all --prune
run git checkout -q "${branch}"

old_head=$(git rev-parse HEAD)

run git pull --ff-only origin "${branch}"

rebuild_all
verify

echo "Deploy OK."
ENDSSH
