docker stop airdrome
docker rm airdrome
docker network create --subnet=172.25.0.0/24 darkstar
docker run -d \
	--name=airdrome \
	--restart on-failure \
	--network=darkstar \
	-p 4321:80 \
	-v /data:/root \
	local/airdrome:latest
#	-p 4321:80 \
#-e SERVER_URL="http://192.168.10.101:4533/navidrome" \
#	-e SERVER_URL="http://lms:5082" \
###	tamland/airsonic-refix:latest
# 	-e SERVER_URL="https://darkstar.zenwalk.org/navidrome" \
