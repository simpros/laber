ARG COMMIT_SHA=unknown

FROM oven/bun:1.3.13-alpine AS base

WORKDIR /app

# ---- Prune the monorepo to the server runtime subgraph ----
# out/json is self-contained: pruned package.jsons plus the bun lockfile,
# bunfig.toml, and referenced patches.
FROM base AS pruner

RUN bun add -g turbo@^2

COPY . .
RUN turbo prune @laber/server --docker

# ---- Install only the pruned dependencies ----
FROM base AS installer

COPY --from=pruner /app/out/json/ .
RUN bun install --frozen-lockfile

COPY --from=pruner /app/out/full/ .

# ---- Production runner: server sources + runtime deps only ----
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
COPY --from=installer --chown=app:app /app/apps/server ./apps/server
COPY --from=installer --chown=app:app /app/packages ./packages
COPY --from=installer --chown=app:app /app/node_modules ./node_modules
COPY --from=installer --chown=app:app /app/package.json ./package.json
COPY --from=installer --chown=app:app /app/bunfig.toml ./bunfig.toml

WORKDIR /app/apps/server

VOLUME /data

EXPOSE 3001/tcp

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3001/api/setup/status || exit 1

CMD ["bun", "run", "src/index.ts"]
