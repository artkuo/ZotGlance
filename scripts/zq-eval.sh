#!/usr/bin/env bash
# Run JavaScript inside the DEV Zotero instance (started by `npm start`) and
# print the JSON result. The code is an async function body with `Zotero`,
# `win` (main window) and `addon` in scope; use `return` for a value.
#
#   scripts/zq-eval.sh 'return Zotero.version'
#   scripts/zq-eval.sh < snippet.js
#
# Needs ZOTGLANCE_DEV_PORT and ZOTGLANCE_DEV_TOKEN in .env. Only talks to the dev
# instance's port, never the real Zotero (23119).
set -euo pipefail
cd "$(dirname "$0")/.."
env_get() { sed -n "s/^$1[[:space:]]*=[[:space:]]*//p" .env | tail -1; }
PORT=$(env_get ZOTGLANCE_DEV_PORT)
TOKEN=$(env_get ZOTGLANCE_DEV_TOKEN)
if [[ -z "$PORT" || -z "$TOKEN" ]]; then
  echo "zq-eval: set ZOTGLANCE_DEV_PORT and ZOTGLANCE_DEV_TOKEN in .env" >&2
  exit 2
fi
if [[ "$PORT" == "23119" ]]; then
  echo "zq-eval: refusing to use the real Zotero port 23119" >&2
  exit 2
fi
if [[ $# -gt 0 ]]; then CODE="$1"; else CODE=$(cat); fi
curl -sS --max-time 30 -X POST "http://127.0.0.1:${PORT}/zotglance/dev/eval" \
  -H "Content-Type: text/plain" \
  -H "x-zotglance-dev-token: ${TOKEN}" \
  --data-binary "$CODE"
echo
