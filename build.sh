export BASE_PATH="/"
rm -rf dist docker

# Build the project
yarn build || exit "error yarn build"

# Rewrite BASE_PATH in static files
(
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
docker build -f docker/Dockerfile -t local/airdrome . || exit "error docker build"
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
	local/airdrome:latest || exit "error build-airdrome.sh"

#rm -rf __TMP__
#mv dist __TMP__
#mkdir dist
# cp -rf __TMP__ dist/airdrome
######
# rm -rf dist
# mv __TMP__ dist
