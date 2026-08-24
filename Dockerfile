FROM node:22-slim AS frontend-builder

WORKDIR /app

COPY package.json ./
COPY frontend/package.json frontend/package-lock.json ./frontend/
RUN cd frontend && npm_config_registry=https://registry.npmmirror.com npm ci --fetch-retries=5 --fetch-retry-factor=2 --fetch-retry-mintimeout=10000 --fetch-retry-maxtimeout=120000

COPY frontend/ ./frontend/
RUN cd frontend && npm run build

FROM node:22-slim AS backend-deps

WORKDIR /app/backend

ARG DEBIAN_MIRROR=mirrors.aliyun.com

RUN sed -i "s|deb.debian.org|${DEBIAN_MIRROR}|g" /etc/apt/sources.list.d/debian.sources \
  && apt-get -o Acquire::Retries=5 -o Acquire::http::Pipeline-Depth=0 update \
  && apt-get -o Acquire::Retries=5 -o Acquire::http::Pipeline-Depth=0 install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY backend/package.json backend/package-lock.json ./

RUN npm_config_registry=https://registry.npmmirror.com npm_config_nodedir=/usr/local npm ci --omit=dev --fetch-retries=5 --fetch-retry-factor=2 --fetch-retry-mintimeout=10000 --fetch-retry-maxtimeout=120000

FROM node:22-slim AS production

WORKDIR /app

ARG APP_VERSION=3.1.10

LABEL org.opencontainers.image.title="Twinkle Image" \
      org.opencontainers.image.description="AI image generation workspace" \
      org.opencontainers.image.version="${APP_VERSION}" \
      org.opencontainers.image.source="https://github.com/bendangmi/Twinkle-Image"

ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    NOVA_TASK_DB=/app/backend/data/nova-tasks.sqlite \
    NOVA_IMAGE_DIR=/app/backend/data/nova-images

COPY --chown=node:node backend/server.js backend/image-retry.js backend/twinkle-model-api.js ./backend/
COPY --chown=node:node --from=backend-deps /app/backend/node_modules/ ./backend/node_modules/
COPY --chown=node:node --from=frontend-builder /app/frontend/out/ ./frontend/out/

RUN mkdir -p /app/backend/data /app/backend/data/nova-images \
  && chown -R node:node /app/backend/data

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/nova/queue-status').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "backend/server.js"]
