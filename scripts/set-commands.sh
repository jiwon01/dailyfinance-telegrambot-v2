#!/usr/bin/env bash

set -euo pipefail

worker_base_url="${1:-${WORKER_BASE_URL:-}}"

if [[ -z "${worker_base_url}" ]]; then
  echo "사용법: $0 <worker-base-url>" >&2
  echo "또는 WORKER_BASE_URL 환경변수를 설정하세요." >&2
  exit 2
fi

curl -fsS "${worker_base_url%/}/setup-commands"
echo
