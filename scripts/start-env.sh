#!/usr/bin/env bash
set -euo pipefail

# Start the Node server using environment variables only (no config.js required).
# Example:
#   NASA_API_KEY=your_key OMDB_API_KEY=your_omdb_key ./scripts/start-env.sh

if [ -z "${NASA_API_KEY:-}" ]; then
  echo "ERROR: NASA_API_KEY is not set in the environment. Provide it and re-run."
  exit 2
fi

echo "Starting server with NASA_API_KEY=${NASA_API_KEY:0:6}... (hidden)"
nohup npm start > /tmp/apod-server.log 2>&1 &
echo "Server started in background. Logs: /tmp/apod-server.log"
