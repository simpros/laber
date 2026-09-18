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

ARG COMMIT_SHA
ENV VITE_COMMIT_SHA=${COMMIT_SHA}

RUN bun install --frozen-lockfile
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
