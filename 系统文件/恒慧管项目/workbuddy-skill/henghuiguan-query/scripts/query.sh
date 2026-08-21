#!/usr/bin/env bash
# 用法: ./query.sh "type=summary"
#       ./query.sh "type=tasks&assignee=张三"
set -euo pipefail

BASE="${HENGHUIGUAN_BASE_URL:-}"
KEY="${HENGHUIGUAN_API_KEY:-}"
QS="${1:-type=summary}"

if [[ -z "$BASE" || -z "$KEY" ]]; then
  echo '{"code":400,"message":"请设置环境变量 HENGHUIGUAN_BASE_URL 与 HENGHUIGUAN_API_KEY","data":null}'
  exit 1
fi

BASE="${BASE%/}"
curl -sS -H "X-Api-Key: ${KEY}" "${BASE}/api/workbuddy/query?${QS}"
