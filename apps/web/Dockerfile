ARG BUN_VERSION

FROM oven/bun:${BUN_VERSION}-alpine AS base

WORKDIR /app

FROM base AS pruner

RUN bun add -g turbo@^2

COPY . .
RUN turbo prune @laber/web --docker

FROM base AS builder

COPY --from=pruner /app/out/json/ .
RUN bun install --frozen-lockfile

COPY --from=pruner /app/out/full/ .

RUN bun run build --filter=@laber/web

FROM nginx:1.27-alpine AS runner

COPY --from=builder /app/apps/web/build /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80/tcp

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:80/ || exit 1
