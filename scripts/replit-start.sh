#!/usr/bin/env sh
# Replit: run the AI service (FastAPI, internal port 8000) and the website (Next.js, public
# port 3000) in one app. The website forwards /api/* to the AI service (apps/web/next.config.ts).
set -e
cd "$(dirname "$0")/.."

export API_PROXY_TARGET="${API_PROXY_TARGET:-http://127.0.0.1:8000}"
PIDS=""
trap 'kill $PIDS 2>/dev/null' EXIT INT TERM

# Optional: run the LLM on a ChatGPT login through the Codex shim (Naman's decision, 2026-11-14).
# Secret CODEX_AUTH_JSON = the contents of ~/.codex/auth.json after `codex login`. A real API
# key (LLM_API_KEY) wins if both are set. The shim only listens on 127.0.0.1.
if [ -n "$CODEX_AUTH_JSON" ] && [ -z "$LLM_API_KEY" ]; then
  export CODEX_HOME="${CODEX_HOME:-$HOME/.trojanhub-codex}"
  mkdir -p "$CODEX_HOME" && chmod 700 "$CODEX_HOME"
  ( umask 077; printf '%s' "$CODEX_AUTH_JSON" > "$CODEX_HOME/auth.json" )
  unset CODEX_AUTH_JSON  # the website and API never see it
  export CODEX_BIN="${CODEX_BIN:-$PWD/.codex-cli/node_modules/.bin/codex}"
  (cd services/ai && exec python -m scripts.codex_shim) &
  PIDS="$PIDS $!"
  export LLM_BASE_URL=http://127.0.0.1:8787/v1 LLM_API_KEY=codex-shim LLM_MODEL="${CODEX_MODEL:-gpt-5.6-luna}"
  echo "LLM: Codex shim (ChatGPT login), model $LLM_MODEL"
fi

(cd services/ai && exec python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 \
  --proxy-headers --forwarded-allow-ips='*') &
AI_PID=$!
PIDS="$PIDS $AI_PID"

# Wait for the AI service (the embedding model takes a few seconds to load).
i=0
until curl -fs http://127.0.0.1:8000/health >/dev/null 2>&1; do
  i=$((i + 1))
  if [ "$i" -gt 120 ]; then echo "AI service did not start"; exit 1; fi
  kill -0 $AI_PID 2>/dev/null || { echo "AI service crashed"; exit 1; }
  sleep 1
done
echo "AI service is up"

exec npm --workspace apps/web run start -- --hostname 0.0.0.0 --port "${PORT:-3000}"
