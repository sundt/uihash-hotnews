#!/usr/bin/env bash
set -euo pipefail

IDEA=${1:-}
if [[ -z "${IDEA}" ]]; then
  echo "Usage: $0 \"<idea prompt>\""
  exit 2
fi

shift || true

REPO_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
OUT_DIR="${REPO_ROOT}/workspace/metagpt"

mkdir -p "${OUT_DIR}"

# Run MetaGPT from OUT_DIR so generated repos land under workspace/metagpt/
cd "${OUT_DIR}"

if ! command -v metagpt >/dev/null 2>&1; then
  echo "metagpt CLI not found. Please install MetaGPT in a dev-only environment and ensure 'metagpt' is on PATH."
  echo "See docs/dev/metagpt.md"
  exit 127
fi

if [[ $# -gt 0 ]]; then
  metagpt "${IDEA}" "$@"
else
  metagpt "${IDEA}"
fi
