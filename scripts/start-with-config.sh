#!/usr/bin/env bash
set -euo pipefail

# Start the Node server using keys from ./config.js (local only).
# This script reads the JS config and exports NASA_API_KEY and OMDB_API_KEY
# into the shell environment, then runs `npm start`.

if [ ! -f ./config.js ]; then
  echo "config.js not found in project root. Create it and add your keys."
  exit 1
fi

# Print export lines using node and eval them in the shell
eval $(node - <<'NODE'
const c = require('./config.js');
if (!c || !c.NASA_API_KEY) {
  console.error('config.js missing NASA_API_KEY');
  process.exit(2);
}
console.log('export NASA_API_KEY="' + c.NASA_API_KEY + '"');
if (c.OMDB_API_KEY) console.log('export OMDB_API_KEY="' + c.OMDB_API_KEY + '"');
NODE
)

echo "Starting server with NASA_API_KEY=${NASA_API_KEY:0:6}... (hidden)"
nohup npm start > /tmp/apod-server.log 2>&1 &
echo "Server started in background. Logs: /tmp/apod-server.log"
