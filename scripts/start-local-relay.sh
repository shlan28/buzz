#!/bin/bash

set -euo pipefail

readonly BUZZ_ROOT="/Users/lu/buzz"
readonly DOCKER_BIN="/usr/local/bin/docker"
readonly RELAY_BIN="${BUZZ_ROOT}/target/release/buzz-relay"
readonly REQUIRED_CONTAINERS=(buzz-postgres buzz-redis buzz-minio)
readonly HEALTH_TIMEOUT_SECONDS=180

export PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"

cd "${BUZZ_ROOT}"

if [[ ! -f "${BUZZ_ROOT}/.env" ]]; then
  echo "Relay environment file is missing: ${BUZZ_ROOT}/.env" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
source "${BUZZ_ROOT}/.env"
set +a

if [[ ! -x "${DOCKER_BIN}" ]]; then
  echo "Docker CLI not found at ${DOCKER_BIN}; waiting for Docker Desktop installation" >&2
  exit 1
fi

if [[ ! -x "${RELAY_BIN}" ]]; then
  echo "Release Relay binary is missing: ${RELAY_BIN}" >&2
  echo "Build it with: cargo build --release -p buzz-relay" >&2
  exit 1
fi

"${DOCKER_BIN}" compose up -d postgres redis minio

deadline=$((SECONDS + HEALTH_TIMEOUT_SECONDS))
for container in "${REQUIRED_CONTAINERS[@]}"; do
  while true; do
    status=$("${DOCKER_BIN}" inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "${container}" 2>/dev/null || true)
    if [[ "${status}" == "healthy" ]]; then
      break
    fi
    if (( SECONDS >= deadline )); then
      echo "Timed out waiting for ${container} to become healthy (status: ${status:-missing})" >&2
      exit 1
    fi
    sleep 2
  done
done

if /usr/sbin/lsof -nP -iTCP:3200 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "TCP port 3200 is already occupied; refusing to start a second Relay" >&2
  /usr/sbin/lsof -nP -iTCP:3200 -sTCP:LISTEN >&2 || true
  exit 1
fi

exec "${RELAY_BIN}"
