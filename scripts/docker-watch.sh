#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

PID_FILE=".docker-watch.pid"
LOG_FILE=".docker-watch.log"

if [ -f "$PID_FILE" ]; then
  OLD_PID="$(cat "$PID_FILE" 2>/dev/null || true)"
  if [ -n "${OLD_PID:-}" ] && kill -0 "$OLD_PID" 2>/dev/null; then
    echo "docker-watch ya está corriendo (pid $OLD_PID)"
    exit 0
  fi
fi

echo $$ > "$PID_FILE"
trap 'rm -f "$PID_FILE"' EXIT

hash_dir() {
  local dir="$1"
  python3 - "$dir" <<'PY'
import hashlib
import os
import sys

root = sys.argv[1]
skip_dirs = {"node_modules", "dist", ".git", ".venv", "__pycache__"}

h = hashlib.sha1()
for base, dirs, files in os.walk(root):
    dirs[:] = [d for d in dirs if d not in skip_dirs]
    for name in sorted(files):
        path = os.path.join(base, name)
        try:
            st = os.stat(path)
        except OSError:
            continue
        h.update(path.encode("utf-8", "ignore"))
        h.update(str(int(st.st_mtime)).encode())

print(h.hexdigest())
PY
}

backend_hash="$(hash_dir backend)"
frontend_hash="$(hash_dir frontend)"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] docker-watch iniciado" | tee -a "$LOG_FILE"

while true; do
  sleep 2

  next_backend_hash="$(hash_dir backend)"
  next_frontend_hash="$(hash_dir frontend)"

  if [ "$next_backend_hash" != "$backend_hash" ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Cambio detectado en backend -> rebuild api" | tee -a "$LOG_FILE"
    ./scripts/docker-apply.sh api >> "$LOG_FILE" 2>&1 || true
    backend_hash="$next_backend_hash"
  fi

  if [ "$next_frontend_hash" != "$frontend_hash" ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Cambio detectado en frontend -> rebuild web" | tee -a "$LOG_FILE"
    ./scripts/docker-apply.sh web >> "$LOG_FILE" 2>&1 || true
    frontend_hash="$next_frontend_hash"
  fi
done
