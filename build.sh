export BASE_PATH="/airdrome/"
rm -rf dist
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

# Build the docker image
docker build -f docker/Dockerfile -t local/airdrome . || exit "error docker build"
# Build the docker container
/root/build-airdrome.sh || exit "error build-airdrome.sh"



#rm -rf __TMP__
#mv dist __TMP__
#mkdir dist
# cp -rf __TMP__ dist/airdrome
######
# rm -rf dist
# mv __TMP__ dist
