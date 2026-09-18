# laber

Homelab stack manager: an **Elysia API** (`apps/server`) plus a **React SPA**
(`apps/web`), sharing a typed Eden client (`packages/api-client`) and a
**SQLite-only** Drizzle store (`packages/db`).

## Quickstart (dev, zero external services)

Requirements: Bun 1.3.13.

```sh
bun install
cp .env.example .env   # then set BETTER_AUTH_SECRET
bun run dev            # api on :3001, web on :5173 (/api proxied to the api)
```

Open the web dev server; on a fresh database you land on `/setup` to create
the first admin, then `/login`.

## Layout

- `apps/server` — Bun + Elysia API. `bun run dev` in the package runs
  `src/index.ts` (migrations + listen on `PORT`, default 3001). One Docker
  image (`apps/server/Dockerfile`): Bun runtime, `packages/db/drizzle`
  baked in, `/data` volume; boots clean from an empty volume.
- `apps/web` — Vite + React 19 SPA (TanStack Router/Query, Tailwind v4).
  `bun run dev` / `bun run build` / `bun run preview` (`:3000`). One Docker
  image (`apps/web/Dockerfile` + `nginx.conf`): static `dist/` behind nginx,
  `/api/*` proxied to `http://api:3001`.
- `packages/db` — Drizzle + `bun-sqlite`, migrations in `packages/db/drizzle`.
- `packages/api-client` — typed Eden client over the server's app type.
- `packages/auth`, `packages/ui`, `packages/logging` — shared auth, React
  components, logging.

## Environment

See `.env.example`. SQLite only:

| Var                    | Default                                                   | Used by                      |
| ---------------------- | --------------------------------------------------------- | ---------------------------- |
| `DATABASE_PATH`        | `<DATA_DIR>/laber.db`                                     | api, `drizzle-kit`           |
| `DATA_DIR`             | `./data`                                                  | api (repos + DB dir)         |
| `BETTER_AUTH_SECRET`   | — (required)                                              | api                          |
| `BETTER_AUTH_BASE_URL` | dev `http://localhost:5173`, prod `http://localhost:3000` | api                          |
| `PORT`                 | `3001`                                                    | api                          |
| `LABER_API_URL`        | `http://localhost:3001`                                   | web dev/preview `/api` proxy |

## Verification

```sh
bun run lint
bun run check
bun run test
bun run build
bun run test:e2e   # temp SQLite DB in apps/web/tests/.data, no external services
```

## Prod (Docker)

```sh
export BETTER_AUTH_SECRET=...   # required
docker compose -f docker-compose.prod.yml up --build
```

- Web on `http://localhost:3000`, API on `http://localhost:3001`
  (also reachable at `/api/*` through the web origin).
- SQLite lives in the `laber_data` volume (`/data/laber.db`); the API runs
  migrations automatically, so an empty volume is the normal first boot.
- The API needs `/var/run/docker.sock` to manage stacks.
