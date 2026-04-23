#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

SERVICES=("$@")
if [ ${#SERVICES[@]} -eq 0 ]; then
  SERVICES=("api" "web")
fi

echo ">> Rebuilding and applying services in Docker: ${SERVICES[*]}"
if [[ "${DOCKER_NO_CACHE:-}" == "1" || "${DOCKER_NO_CACHE:-}" == "true" ]]; then
  for svc in "${SERVICES[@]}"; do
    docker compose build --no-cache "$svc" || true
  done
fi
docker compose up -d --build "${SERVICES[@]}"

echo ">> Current container status"
docker compose ps
