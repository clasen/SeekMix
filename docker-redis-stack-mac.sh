export PORT="6379"
export NAME="redis-main-stack-server-${PORT}"
export ROOT_DIR="${HOME}/Docker/${NAME}"

redis-install() {
    # http://download.redis.io/releases/
    # https://hub.docker.com/r/redis/redis-stack-server/tags

    REDIS_VERSION="7.4.0"
    REDIS_RELEASE="-v3"

    DATA_DIR="${ROOT_DIR}/data"
    # BIND="127.0.0.1"
    BIND="0.0.0.0"
    REDIS_SEARCH_ARGS="TIMEOUT 250 MINPREFIX 3"

    mkdir -p "${ROOT_DIR}"
    mkdir -p "${DATA_DIR}"

    if [ ! -f "${ROOT_DIR}/redis.conf" ]; then
        curl -s http://download.redis.io/releases/redis-${REDIS_VERSION}.tar.gz | tar xz --strip-components=1 -C "${ROOT_DIR}" redis-${REDIS_VERSION}/redis.conf

        sed -i '' "s/^port 6379/port ${PORT}/" "${ROOT_DIR}/redis.conf"
        sed -i '' "s|^bind 127|\# bind 127|" "${ROOT_DIR}/redis.conf"
        sed -i '' '1irename-command FLUSHALL "NFLUSHALL"' "${ROOT_DIR}/redis.conf"
        sed -i '' '1irename-command DEBUG "NDEBUG"' "${ROOT_DIR}/redis.conf"
        sed -i '' '1irename-command FLUSHDB "NFLUSHDB"' "${ROOT_DIR}/redis.conf"
        sed -i '' '1irename-command KEYS "NKEYS"' "${ROOT_DIR}/redis.conf"
        sed -i '' '1irename-command CONFIG "NCONFIG"' "${ROOT_DIR}/redis.conf"
    fi

    # No need for sysctl setup on macOS as Docker handles these settings

    docker run -v "${ROOT_DIR}/redis.conf:/redis-stack.conf" \
               -v "${DATA_DIR}:/data" \
               -d \
               --restart=always \
               --name ${NAME} \
               -e REDISEARCH_ARGS="${REDIS_SEARCH_ARGS}" \
               -p ${BIND}:${PORT}:${PORT} \
               redis/redis-stack-server:${REDIS_VERSION}${REDIS_RELEASE}

    brew install redis
}

redis-remove() {
    docker stop ${NAME}
    docker rm ${NAME}
    brew uninstall redis
}

redis-remove-conf() {
    rm "${ROOT_DIR}/redis.conf"
}

redis-remove-all() {
    redis-remove
    rm -rf "${ROOT_DIR}"
}

redis-conf() {
    open -e "${ROOT_DIR}/redis.conf"
}

redis-start() {
    docker start ${NAME}
}

redis-stop() {
    docker stop ${NAME}
}

redis-restart() {
    docker restart ${NAME}
}

redis-stats() {
    docker stats ${NAME}
}

redis-bash() {
    docker exec -it ${NAME} bash
}

redis-bash-cli() {
    docker exec -it ${NAME} redis-cli -p ${PORT} $1
}

redis-log() {
    docker logs -f ${NAME}
}

redis-data() {
    cd "${ROOT_DIR}/data"
    ls -lah
} 