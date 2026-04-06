#!/usr/bin/env bash
# Arranca FastAPI en :8000 y el frontend Vite en :5173 (proxy /api → API).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/frontend"

if ! command -v python3.12 &>/dev/null; then
  echo "Se requiere python3.12 en PATH." >&2
  exit 1
fi

cd "$BACKEND"
if ! python3.12 -c "import oderbiz_analytics" 2>/dev/null; then
  echo "Instalando backend en modo editable desde $BACKEND …" >&2
  python3.12 -m pip install -e ".[dev]" >&2
fi

echo "→ API http://127.0.0.1:8000 (uvicorn --reload)" >&2
python3.12 -m uvicorn oderbiz_analytics.api.main:app --reload --host 127.0.0.1 --port 8000 &
UV_PID=$!

cleanup() {
  kill "$UV_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

for _ in $(seq 1 30); do
  if curl -sf "http://127.0.0.1:8000/health" >/dev/null; then
    break
  fi
  sleep 0.2
done

cd "$FRONTEND"
echo "→ Web http://localhost:5173 (Ctrl+C cierra API y Vite)" >&2
npm run dev
