#!/usr/bin/env bash
# Starts the DaCy server (port 8787) and the Expo dev server together.
# Expo SDK 58 needs Node >= 22.13, so a compatible Node binary is picked first.
#
#   ./dev.sh          # tunnel mode (works on any network; the API goes through the same tunnel)
#   ./dev.sh --lan    # LAN mode: iPhone and Mac on the same Wi-Fi
#   ./dev.sh --web    # web preview in the browser
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"

node_major() { "$1" -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0; }

NODE_BIN=""
for candidate in "$(command -v node || true)" /usr/local/bin/node /opt/homebrew/opt/node@22/bin/node /opt/homebrew/bin/node; do
  if [[ -n "$candidate" && -x "$candidate" && "$(node_major "$candidate")" -ge 22 ]]; then
    NODE_BIN="$candidate"
    break
  fi
done
if [[ -z "$NODE_BIN" ]]; then
  echo "Node >= 22.13 is required (found $(node -v 2>/dev/null || echo none)). Install Node 22/24 and retry." >&2
  exit 1
fi
export PATH="$(dirname "$NODE_BIN"):$PATH"
echo "Using Node $(node -v) from $NODE_BIN"

if [[ ! -f "$ROOT/server/.env" ]]; then
  echo "ℹ  server/.env not found — the server starts without AI/speech keys (offline engine still works)."
  echo "   Copy server/.env.example to server/.env and add your keys for Cloud AI + live listening."
fi

cleanup() { [[ -n "${SERVER_PID:-}" ]] && kill "$SERVER_PID" 2>/dev/null || true; }
trap cleanup EXIT INT TERM

(cd "$ROOT/server" && npm run dev) &   # restarts automatically when server/.env changes
SERVER_PID=$!

cd "$ROOT/mobile"
case "${1:-}" in
  --web) npx expo start --web ;;
  --lan) npx expo start --lan ;;
  *) npx expo start --tunnel ngrok ;;
esac
