#!/bin/bash
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ---------------------------------------------------------------------------
# Android toolchain + signing environment
# ---------------------------------------------------------------------------
# These defaults match the local build machine. Override them from your shell
# if your JDK / Android SDK live elsewhere.
export JAVA_HOME="${JAVA_HOME:-/tmp/opencode/jdk21}"
export PATH="$JAVA_HOME/bin:$PATH"
export ANDROID_HOME="${ANDROID_HOME:-/home/hyperion/.bubblewrap/android_sdk}"
export ANDROID_SDK_ROOT="${ANDROID_SDK_ROOT:-$ANDROID_HOME}"

# Keep signing passwords out of git. Copy .android-signing.env.example to
# .android-signing.env (gitignored) and fill it in, or export the variables
# in your shell before running the build.
if [ -f "$SCRIPT_DIR/.android-signing.env" ]; then
  . "$SCRIPT_DIR/.android-signing.env"
fi

export STORE_PASSWORD="${STORE_PASSWORD:-}"
export KEY_PASSWORD="${KEY_PASSWORD:-}"
export KEY_ALIAS="${KEY_ALIAS:-airdrome}"

source VERSION
export BASE_PATH="/"
echo "Building $VERSION ..."

rm -rf dist docker

# Build the project
if command -v yarn >/dev/null 2>&1 && [ -f yarn.lock ]; then
  yarn build || exit 1
else
  npm run build || exit 1
fi

# Rewrite BASE_PATH in static files
(
rmdir .tmp${BASE_PATH} || exit "error cleaning .tmp${BASE_PATH}"
mkdir .tmp${BASE_PATH}
mv dist/* .tmp${BASE_PATH}
mkdir dist${BASE_PATH}
mv .tmp${BASE_PATH}/* dist${BASE_PATH}
rmdir .tmp${BASE_PATH} || exit "error cleaning .tmp${BASE_PATH}"
cd dist${BASE_PATH}

# sed -i "s|\([\"\']\)/|\1$BASE_PATH|g" index.html
sed -i "s|\([\"\']\)/|\1$BASE_PATH|g" manifest.webmanifest
sed -i "s|const APP_BASE.*|const APP_BASE = \'$BASE_PATH\'|g" service-worker.js
echo "/*    ${BASE_PATH}index.html   200" > _redirects
)

cp -rf docker.template docker
(
cd docker
sed -i "s|/env.js|${BASE_PATH}env.js|g" docker-entrypoint.sh
sed -i "s|/env.js|${BASE_PATH}env.js|g" nginx.conf
sed -i "s|/index.html|${BASE_PATH}index.html|g" nginx.conf
)

mv dist${BASE_PATH}.well-known dist/

# Build the docker image
docker build -f docker/Dockerfile -t local/airdrome:latest . || exit "error docker build"

# Build the docker container
docker stop airdrome
docker rm airdrome
docker network create --subnet=172.25.0.0/24 darkstar
docker run -d \
  --name=airdrome \
  --restart=always \
  --network=darkstar \
  -p 4321:80 \
  -v /data:/root \
  local/airdrome:latest || exit "error run airdrome"

