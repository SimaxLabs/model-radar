# syntax=docker/dockerfile:1.7

ARG NODE_IMAGE=node:24-slim@sha256:6f7b03f7c2c8e2e784dcf9295400527b9b1270fd37b7e9a7285cf83b6951452d
ARG BASE_PATH=""

FROM ${NODE_IMAGE} AS build

ARG BASE_PATH
ENV BASE_PATH=${BASE_PATH}

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

COPY svelte.config.js tsconfig.json vite.config.ts vitest.config.mts ./
COPY src ./src

RUN npm run prepare && npm run build && npm prune --omit=dev --ignore-scripts

FROM ${NODE_IMAGE} AS runtime

ARG BASE_PATH

LABEL org.opencontainers.image.title="Model Radar" \
      org.opencontainers.image.description="OpenRouter pricing and Artificial Analysis model intelligence dashboard"

ENV NODE_ENV=production \
    BASE_PATH=${BASE_PATH} \
    HOST=0.0.0.0 \
    PORT=3000 \
    BODY_SIZE_LIMIT=16K \
    NODE_OPTIONS="--enable-source-maps --max-old-space-size=384" \
    TZ=UTC

WORKDIR /app

RUN mkdir -p /app/data && chown node:node /app/data

COPY --from=build --chown=node:node /app/build ./build
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/package.json ./package.json

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch(`http://127.0.0.1:3000${process.env.BASE_PATH || ''}/api/health`).then((response) => { if (!response.ok) process.exit(1) }).catch(() => process.exit(1))"]

STOPSIGNAL SIGTERM

CMD ["node", "build"]
