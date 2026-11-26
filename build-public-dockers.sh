#!/bin/bash
#
# Build and push the multi-arch public Docker images.
#
# Run ./build.sh first as your normal user to create dist/. This script only
# needs Docker/buildx access (root or the docker group); it never runs the web
# build itself, so it is safe to run as root.
#
# Usage:
#   ./build.sh
#   ./build-public-dockers.sh
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

# ---------------------------------------------------------------------------
# Buildx cleanup
# ---------------------------------------------------------------------------
# Multi-platform builds leave a buildkit builder/container behind. Stop and
# remove it even when the build fails, so the host stays clean.
cleanup_buildx() {
  echo "Cleaning up buildx..."

  docker buildx prune -af >/dev/null 2>&1 || true

  local builder
  builder="$(docker buildx inspect 2>/dev/null | awk '/^Name:/ {print $2; exit}' || true)"

  if [ -n "$builder" ] && [ "$builder" != "default" ]; then
    docker buildx stop "$builder" >/dev/null 2>&1 || true
    docker buildx rm --force "$builder" >/dev/null 2>&1 || true
  fi

  local containers
  containers="$(docker ps -aq --filter 'name=buildx_buildkit_' 2>/dev/null || true)"

  if [ -n "$containers" ]; then
    docker stop $containers >/dev/null 2>&1 || true
    docker rm -f $containers >/dev/null 2>&1 || true
  fi
}

trap cleanup_buildx EXIT

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

docker run --privileged --rm tonistiigi/binfmt --install all

echo "==> Building and pushing multi-arch images"
docker buildx build \
  -f docker/Dockerfile \
  --platform linux/amd64,linux/arm64 \
  -t h7p3ri0n/airdrome:latest \
  --push .

docker buildx build \
  -f docker/Dockerfile \
  --platform linux/amd64,linux/arm64 \
  -t "h7p3ri0n/airdrome:$VERSION" \
  --push .
