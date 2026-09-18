ARG COMMIT_SHA=unknown

FROM oven/bun:1.3.13-alpine AS base

WORKDIR /app

# ---- Prune the monorepo to the web build subgraph ----
# (@laber/web -> @laber/api-client -> @laber/server types, so the pruned
# sources include the server for typechecking. Only dist/ leaves the builder.)
FROM base AS pruner

RUN bun add -g turbo@^2

COPY . .
RUN turbo prune @laber/web --docker

# ---- Install pruned deps + build the SPA ----
FROM base AS builder

COPY --from=pruner /app/out/json/ .
RUN bun install --frozen-lockfile

COPY --from=pruner /app/out/full/ .

ARG COMMIT_SHA
ENV VITE_COMMIT_SHA=${COMMIT_SHA}

RUN bun run build --filter=@laber/web

# ---- Production runner: static files behind nginx ----
FROM nginx:1.27-alpine AS runner

ARG COMMIT_SHA
ENV COMMIT_SHA=${COMMIT_SHA}

COPY --from=builder /app/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80/tcp

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:80/health || exit 1
