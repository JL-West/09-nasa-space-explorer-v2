#!/usr/bin/env bash
set -euo pipefail

PORT=${1:-8000}
URL="http://localhost:${PORT}/index.html"
TMP=/tmp/nasa_index.html

echo "Fetching $URL"
if ! curl -sSf "$URL" -o "$TMP"; then
  echo "Failed to fetch $URL"
  exit 2
fi

grep -q 'id="getImageBtn"' "$TMP" && echo "getImageBtn: OK" || echo "getImageBtn: MISSING"
grep -q 'id="gallery"' "$TMP" && echo "gallery: OK" || echo "gallery: MISSING"
grep -q 'id="funFact"' "$TMP" && echo "funFact: OK" || echo "funFact: MISSING"

echo "Done"
