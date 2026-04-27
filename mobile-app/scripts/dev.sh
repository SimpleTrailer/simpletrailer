#!/usr/bin/env bash
# Dev-Loop: bootstrap-Aenderungen testen ohne native Build
# Startet einen lokalen HTTP-Server fuer www/ — dann im Browser oeffnen
set -e
cd "$(dirname "$0")/../www"

PORT=${PORT:-5173}
echo "Serving www/ at http://localhost:$PORT"
echo "(Strg+C zum Beenden)"
npx --yes http-server . -p "$PORT" -c-1
