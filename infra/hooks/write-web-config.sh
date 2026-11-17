#!/bin/sh
# azd prepackage hook for the `web` service (runs in src/frontend).
# Writes public/runtime-config.json so the same Angular build works in every environment:
# - apiBaseUrl: the deployed API URL (Bicep output API_BASE_URL)
# - auth: sign-in settings, only when all four KGP_* values below are set in the azd env
#   (see docs/auth-setup.md). Without the block the app hides sign-in. None of these are secrets.
set -eu
: "${API_BASE_URL:?API_BASE_URL is not set. Run azd provision before azd deploy (azd up packages too early)}"

tenant_id=${KGP_AUTH_TENANT_ID:-}
subdomain=${KGP_AUTH_TENANT_SUBDOMAIN:-}
api_client_id=${KGP_API_CLIENT_ID:-}
spa_client_id=${KGP_SPA_CLIENT_ID:-}

# The values are written into JSON as-is, so refuse anything that would need escaping.
for value in "$API_BASE_URL" "$tenant_id" "$subdomain" "$api_client_id" "$spa_client_id"; do
  case "$value" in
    *\"* | *\\* ) echo "write-web-config: value contains a quote or backslash: $value" >&2; exit 1 ;;
  esac
done

if [ -n "$tenant_id" ] && [ -n "$subdomain" ] && [ -n "$api_client_id" ] && [ -n "$spa_client_id" ]; then
  authority="https://$subdomain.ciamlogin.com/$tenant_id/v2.0"
  printf '{\n  "apiBaseUrl": "%s",\n  "auth": {\n    "clientId": "%s",\n    "authority": "%s",\n    "apiScope": "api://%s/Conquests.ReadWrite"\n  }\n}\n' \
    "$API_BASE_URL" "$spa_client_id" "$authority" "$api_client_id" > public/runtime-config.json
  echo "Wrote public/runtime-config.json -> $API_BASE_URL, sign-in via $authority"
else
  printf '{ "apiBaseUrl": "%s" }\n' "$API_BASE_URL" > public/runtime-config.json
  echo "Wrote public/runtime-config.json -> $API_BASE_URL (sign-in off: KGP_AUTH_TENANT_ID, KGP_AUTH_TENANT_SUBDOMAIN, KGP_API_CLIENT_ID or KGP_SPA_CLIENT_ID not set)"
fi
