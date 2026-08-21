#!/usr/bin/env bash
# HengHuiGuan share-demo launcher (macOS / Linux)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
SERVER="$ROOT/server"

if ! command -v node >/dev/null 2>&1; then
  echo "[ERROR] node not found. Install Node.js 18+: https://nodejs.org/"
  exit 1
fi

echo "Using Node: $(command -v node)"
echo "Open later: http://localhost:3001/app"
echo ""
cd "$SERVER"
exec node scripts/start-share-demo.js
