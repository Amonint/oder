#!/usr/bin/env bash
# Configura SITE_AUTH_* en un Web Service de Render desde la terminal.
# La CLI `render` oficial no expone edición de variables; esto usa la API REST.
#
# Requisitos:
#   1) API key: https://dashboard.render.com → Account → API Keys
#   2) ID del servicio (API), p. ej. oderbiz-api-v2 → srv-…
#
# Uso:
#   export RENDER_API_KEY="rnd_…"
#   export RENDER_SERVICE_ID="srv-d7l9gem7r5hc73d8hf00"
#   export SITE_AUTH_USER="admin"
#   export SITE_AUTH_PASSWORD="tu-contraseña"
#   export SITE_AUTH_SECRET="$(openssl rand -hex 32)"
#   ./scripts/render-site-auth-env.sh
#
# Opcional: al final despliega de nuevo
#   RENDER_REDEPLOY=1 ./scripts/render-site-auth-env.sh
#
set -euo pipefail

API="https://api.render.com/v1"

: "${RENDER_API_KEY:?Falta RENDER_API_KEY}"
: "${RENDER_SERVICE_ID:?Falta RENDER_SERVICE_ID (ID del servicio de la API)}"
: "${SITE_AUTH_USER:?Falta SITE_AUTH_USER}"
: "${SITE_AUTH_PASSWORD:?Falta SITE_AUTH_PASSWORD}"
: "${SITE_AUTH_SECRET:?Falta SITE_AUTH_SECRET}"

put_env() {
  local key="$1"
  local value="$2"
  local payload
  payload=$(python3 -c 'import json,sys; print(json.dumps({"value": sys.argv[1]}))' "$value")
  /usr/bin/curl -sS -f -X PUT \
    "${API}/services/${RENDER_SERVICE_ID}/env-vars/${key}" \
    -H "Authorization: Bearer ${RENDER_API_KEY}" \
    -H "Accept: application/json" \
    -H "Content-Type: application/json" \
    -d "$payload"
  echo "OK: ${key}"
}

# Documentación: https://api-docs.render.com/reference/update-env-var
put_env "SITE_AUTH_USER" "$SITE_AUTH_USER"
put_env "SITE_AUTH_PASSWORD" "$SITE_AUTH_PASSWORD"
put_env "SITE_AUTH_SECRET" "$SITE_AUTH_SECRET"

if [[ "${RENDER_REDEPLOY:-0}" == "1" ]]; then
  if command -v render >/dev/null 2>&1; then
    echo "Lanzando deploy…"
    render deploys create "$RENDER_SERVICE_ID" --output text --confirm
  else
    echo "No está el binario 'render' en PATH; dispara un deploy manual desde el dashboard o: render deploys create ${RENDER_SERVICE_ID}"
  fi
else
  echo "Listo. En Render, despliega de nuevo el servicio de la API (o: RENDER_REDEPLOY=1 $0) para que tome las variables."
fi
