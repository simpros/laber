ARG BUN_VERSION

FROM oven/bun:${BUN_VERSION}-alpine AS base

WORKDIR /app

FROM base AS pruner

RUN bun add -g turbo@^2

COPY . .
RUN turbo prune @laber/server --docker

FROM base AS installer

COPY --from=pruner /app/out/json/ .
RUN bun install --production --frozen-lockfile

COPY --from=pruner /app/out/full/ .

FROM oven/bun:${BUN_VERSION}-alpine AS runner

WORKDIR /app

RUN apk add --no-cache curl git openssh-client docker-cli docker-cli-compose && \
    addgroup --system --gid 1001 app && \
    adduser --system --uid 1001 -G app app && \
    mkdir -p /data && chown app:app /data
USER app

ENV NODE_ENV=production
ENV PORT=3001
ENV DATABASE_PATH=/data/laber.db
ENV DATA_DIR=/data

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
