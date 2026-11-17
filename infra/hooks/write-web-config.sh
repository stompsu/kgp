#!/bin/sh
# azd prepackage hook for the `web` service (runs in src/frontend).
# Writes the deployed API URL into public/runtime-config.json so the same Angular build works in every environment.
set -eu
: "${API_BASE_URL:?API_BASE_URL is not set. Run azd provision before azd deploy (azd up packages too early)}"
printf '{ "apiBaseUrl": "%s" }\n' "$API_BASE_URL" > public/runtime-config.json
echo "Wrote public/runtime-config.json -> $API_BASE_URL"
