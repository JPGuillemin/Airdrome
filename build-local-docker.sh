#!/bin/bash
#
# Build and run the local Docker image.
#
# Run ./build.sh first as your normal user to create dist/. This script only
# needs Docker access (root or the docker group); it never runs the web build
# itself, so it is safe to run as root.
#
# Usage:
#   ./build.sh
#   ./build-local-docker.sh
#   BASE_PATH=/airdrome/ ./build.sh && BASE_PATH=/airdrome/ ./build-local-docker.sh
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

source VERSION

BASE_PATH="${BASE_PATH:-/}"

case "$BASE_PATH" in
  /*) ;;
  *) BASE_PATH="/$BASE_PATH" ;;
esac

case "$BASE_PATH" in
  */) ;;
  *) BASE_PATH="$BASE_PATH/" ;;
esac

export BASE_PATH

# The web bundle must have been built as a normal user first.
if [ ! -f "dist${BASE_PATH}index.html" ]; then
  echo "dist${BASE_PATH}index.html not found. Run ./build.sh as your normal user first." >&2
  exit 1
fi

# Prepare the Docker build context from the template.
rm -rf docker
cp -rf docker.template docker
(
  cd docker
  sed -i "s|/env.js|${BASE_PATH}env.js|g" docker-entrypoint.sh
  sed -i "s|/env.js|${BASE_PATH}env.js|g" nginx.conf
  sed -i "s|/index.html|${BASE_PATH}index.html|g" nginx.conf
)

# When run as root, keep the generated context owned by the project user so a
# later normal-user build can still replace it.
if [ "$(id -u)" -eq 0 ]; then
  chown -R --reference="$SCRIPT_DIR" docker
fi

echo "==> Building local Docker image"
docker build -f docker/Dockerfile -t local/airdrome:latest .

echo "==> Restarting container"
docker stop airdrome >/dev/null 2>&1 || true
docker rm airdrome >/dev/null 2>&1 || true
docker network inspect darkstar >/dev/null 2>&1 ||
  docker network create --subnet=172.25.0.0/24 darkstar

docker run -d \
  --name=airdrome \
  --restart=always \
  --network=darkstar \
  -p 4321:80 \
  -v /data:/root \
  local/airdrome:latest

echo "Airdrome: http://localhost:4321"
