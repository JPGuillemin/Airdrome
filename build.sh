#!/bin/bash
#
# Build the web bundle (PWA) into dist/.
#
# This script never needs root. The Docker image/container build lives in
# build-local-docker.sh, and the Android build lives in build-apk.sh.
#
# Usage:
#   ./build.sh
#   BASE_PATH=/airdrome/ ./build.sh
#
set -euo pipefail

# Building as root leaves root-owned files in dist/, which then breaks normal
# builds and deployments. This script must run as the project owner.
if [ "$(id -u)" -eq 0 ]; then
  echo "Refusing to run build.sh as root: it would leave root-owned files in dist/." >&2
  echo "Run it as your normal user. The Docker scripts can be run separately." >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

source VERSION

BASE_PATH="${BASE_PATH:-/}"

# Normalise the sub-path to a leading and trailing slash.
case "$BASE_PATH" in
  /*) ;;
  *) BASE_PATH="/$BASE_PATH" ;;
esac

case "$BASE_PATH" in
  */) ;;
  *) BASE_PATH="$BASE_PATH/" ;;
esac

export BASE_PATH

echo "Building $VERSION ..."

rm -rf dist

if command -v yarn >/dev/null 2>&1 && [ -f yarn.lock ]; then
  yarn build
else
  npm run build
fi

# When the app is served from a sub-path, move the bundle under dist/<path>/.
if [ "$BASE_PATH" != "/" ]; then
  rm -rf ".tmp${BASE_PATH}"
  mkdir -p ".tmp${BASE_PATH}"
  mv dist/* ".tmp${BASE_PATH}/"
  mkdir -p "dist${BASE_PATH}"
  mv ".tmp${BASE_PATH}"/* "dist${BASE_PATH}/"
  rmdir ".tmp${BASE_PATH}"

  # Android App Links must stay at the site root, not under the sub-path.
  if [ -d "dist${BASE_PATH}.well-known" ]; then
    mv "dist${BASE_PATH}.well-known" dist/
  fi
fi

cd "dist${BASE_PATH}"

sed -i "s|\([\"\']\)/|\1$BASE_PATH|g" manifest.webmanifest
echo "/*    ${BASE_PATH}index.html   200" > _redirects

echo "Web bundle: $SCRIPT_DIR/dist/"
