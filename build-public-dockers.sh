#!/bin/bash

source VERSION
export BASE_PATH="/"

rm -rf dist docker

docker run --privileged --rm tonistiigi/binfmt --install all

# Build the project
yarn build || exit 1

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
docker buildx build -f docker/Dockerfile --platform linux/amd64,linux/arm64 -t h7p3ri0n/airdrome:latest --push . || exit "error docker buildx"
docker buildx build -f docker/Dockerfile --platform linux/amd64,linux/arm64 -t h7p3ri0n/airdrome:$VERSION --push . || exit "error docker buildx"
docker buildx prune -af
docker buildx rm "$(docker buildx inspect | awk '/^Name:/ {print $2; exit}')"
