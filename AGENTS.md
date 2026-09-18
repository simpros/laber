# AGENTS.md

laber is a Bun + Turborepo monorepo (`apps/*`, `packages/*`) in TypeScript.

## Stack

- **API** (`apps/server`): Bun + Elysia 1.x, better-auth (`/api/auth/*`), Drizzle
  over `bun-sqlite`. Runs migrations at boot (`runMigrations()`, fail-fast);
  a fresh empty SQLite file is the normal start state. Session guard on every
  other `/api/*` route (401 unauthenticated).
- **Web** (`apps/web`): Vite + React 19 SPA (TanStack Router + Query +
  Tailwind v4) on `@laber/api-client` (Eden treaty over the server's app
  type). `/api/*` proxies to the API (`LABER_API_URL`, default
  `http://localhost:3001`); `EventSource` for the SSE streams.
- **DB** (`packages/db`): Drizzle + SQLite only (`drizzle-orm/bun-sqlite`,
  migrations in `packages/db/drizzle`). Paths via `DATABASE_PATH` / `DATA_DIR`
  (WAL). No Postgres anywhere: no services, deps, env, or docs.
- **Shared**: `@laber/api-client` (typed Eden client), `@laber/auth`
  (better-auth config + React client), `@laber/ui` (React components),
  `@laber/logging`, plus `eslint-config`, `typescript-config`,
  `tailwind-config`.

## Layout

- `apps/server`: `src/index.ts` (boot + migrate + listen on `PORT`, default
  3001), `src/app.ts`, `src/routes/*`, `src/lib/*`, `Dockerfile` (Bun,
  migrations baked in, `/data` volume). Tests: `bun test` (temp SQLite file,
  docker mocked).
- `apps/web`: `src/main.tsx`, `src/router.tsx`, `src/pages/*`,
  `src/components/*`, `nginx.conf` + `Dockerfile` (static `dist/` behind
  nginx, `/api/` proxied to `http://api:3001`). Tests: `bun test`
  (happy-dom); e2e: Playwright against a temp SQLite DB
  (`tests/.data`, `apps/server` + `vite preview` via `playwright.config.ts`).
- `docker-compose.prod.yml`: `api` (SQLite volume `laber_data:/data`, docker
  socket, `:3001`) + `web` (static, `:3000` → nginx `:80`, `/api` proxied to
  `api:3001`). Dev needs zero external services.

## Commands

- `bun install` (Bun 1.3.13), `bun run dev` (all apps, parallel).
- `bun run lint` / `bun run check` / `bun run test` / `bun run build`
  (turborepo; CI runs each as its own job plus e2e + image builds).
- E2E: `bun run test:e2e` at root, or `bun run test:e2e` in `apps/web`
  (builds the SPA if `dist/` is missing, boots the API on a temp SQLite
  file in `tests/.data`).
- Prod parity: `docker compose -f docker-compose.prod.yml up --build`
  (needs `BETTER_AUTH_SECRET`; API migrates a fresh volume automatically).

## Verification

- `bun run lint`, `bun run check`, `bun run test`, `bun run build` green.
- E2E green with SQLite only (`apps/web`: `bun run test:e2e`).
- `grep -rni postgres` shows no services/deps/env/docs (test fixtures using
  a `postgres:` image string as sample compose data are fine).
- `docker compose -f docker-compose.prod.yml up --build` serves api + web
  with a persistent SQLite volume; the API boots clean from an empty volume.

## Agent skills

### Issue tracker

Issues are tracked as GitHub issues on `simpros/laber`, via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default label vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context convention: one `CONTEXT.md` + `docs/adr/` at the repo root (neither exists yet — created lazily by `/domain-modeling`). See `docs/agents/domain.md`.
