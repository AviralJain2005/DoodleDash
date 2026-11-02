#!/bin/sh
# [SCALING] Start three room-owning processes and the directory gateway for local affinity development.
set -eu
cd "$(dirname "$0")/.."
export REDIS_URL="${REDIS_URL:-redis://localhost:6379}"
export CLIENT_ORIGIN="${CLIENT_ORIGIN:-http://localhost:5173}"
node src/gateway/index.js & gateway_pid=$!
node_pids=""
for port in 3001 3002 3003; do
  NODE_ID="node-$port" PORT="$port" PUBLIC_URL="http://localhost:$port" node src/index.js &
  node_pids="$node_pids $!"
done
trap 'kill "$gateway_pid" $node_pids 2>/dev/null || true' INT TERM EXIT
wait "$gateway_pid"
