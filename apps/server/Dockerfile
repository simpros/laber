ARG COMMIT_SHA=unknown

FROM oven/bun:1.3.13-alpine AS builder

WORKDIR /app

# Full source (node_modules, dist, data and .git are excluded via .dockerignore).
COPY package.json ./package.json
COPY bun.lock ./bun.lock
COPY turbo.json ./turbo.json
COPY bunfig.toml ./bunfig.toml
COPY patches ./patches
COPY apps ./apps
COPY packages ./packages

RUN bun install --frozen-lockfile

# ---- Production runner ----
FROM oven/bun:1.3.13-alpine AS runner

ARG COMMIT_SHA

WORKDIR /app

RUN apk add --no-cache curl git openssh-client docker-cli docker-cli-compose && \
    addgroup --system --gid 1001 app && \
    adduser --system --uid 1001 -G app app && \
    mkdir -p /data && chown app:app /data
USER app

ENV NODE_ENV=production
ENV PORT=3001
ENV COMMIT_SHA=${COMMIT_SHA}
ENV DATABASE_PATH=/data/laber.db
ENV DATA_DIR=/data

# Migrations ship inside @laber/db (packages/db/drizzle); the server runs
# them at boot via runMigrations() and fail-fasts on error. A fresh empty
# /data volume is the normal start state.
COPY --from=builder --chown=app:app /app/apps/server ./apps/server
COPY --from=builder --chown=app:app /app/packages ./packages
COPY --from=builder --chown=app:app /app/node_modules ./node_modules
COPY --from=builder --chown=app:app /app/package.json ./package.json

WORKDIR /app/apps/server

VOLUME /data

EXPOSE 3001/tcp

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3001/api/setup/status || exit 1

CMD ["bun", "run", "src/index.ts"]
