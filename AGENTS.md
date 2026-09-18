# AGENTS.md

laber is a Bun + Turborepo monorepo (`apps/*`, `packages/*`) in TypeScript.

## Stack

- Backend: standalone Elysia API in `apps/server` with a typed Eden client in `packages/api-client`.
- Frontend: React SPA in `apps/web` (Vite + TanStack Router/Query/Form, Tailwind, `@laber/ui`).
- Store: SQLite via Drizzle in `packages/db` (WAL, `DATA_DIR` / `DATABASE_PATH` for the file location).
- Auth: better-auth in `packages/auth`.
- Runtime/toolchain: Bun 1.x, Turbo for task orchestration.

## Commands

Run from the repo root unless noted:

- `bun run dev` — all dev servers in parallel (Turbo).
- `bun run build` / `bun run check` (`tsc --noEmit`) / `bun run lint` (`eslint`) — per-package via Turbo.
- `bun run test` — unit/integration (`bun test` per package; server tests need ~60s timeout).
- `bun run format` / `bun run format:check` — Prettier (2-space, double quotes, print width 75).
- `bun run db:generate` / `db:migrate` / `db:push` / `db:studio` — Drizzle Kit via `@laber/db`.
- Package-scoped: `bun run --filter <pkg> <task>` or `cd apps/server && bun test <file>`.

Server tests preload `./svelte-test-setup.ts` via `bunfig.toml`; run them from `apps/server` so the happy-dom globals at the repo root do not shadow `Response`/`Headers`.

## Layout

- `apps/server/src/lib/` — domain logic (compose, git, stacks, deploy, Docker engine).
- `apps/server/src/routes/` — Elysia route modules mounted by `src/app.ts`.
- `apps/server/tests/` — `bun test` suites plus `docker-stub.ts` / `helpers.ts` / `setup.ts`.
- `apps/web/src/` — `components/`, `lib/` (+ `lib/queries/`), `pages/`, `router.tsx`, `main.tsx`.
- `packages/` — `api-client`, `auth`, `db` (schema/client/migrate), `ui`, `logging`, plus shared `eslint-config`, `typescript-config`, `tailwind-config`.

## Style

- Prettier is the formatter; `@laber/eslint-config` (eslint + typescript-eslint + `consistent-type-imports`, no unused vars) is the linter.
- TypeScript `strict`; prefer `import type` for type-only imports.
- Comments state the why only. See `docs/agents/comment-style.md` — no ticket/issue/PR/people refs, no history narration, no commented-out code, one line beats three.

## Agent skills

### Issue tracker

Issues are tracked as GitHub issues on `simpros/laber`, via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default label vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context convention: one `CONTEXT.md` + `docs/adr/` at the repo root (neither exists yet — created lazily by `/domain-modeling`). See `docs/agents/domain.md`.

### Comment style

Comment hygiene contract (state the why only, 11 rules). See `docs/agents/comment-style.md`.

### Pull requests

Every PR body follows the `visual-pr` template — Why in one sentence, 1-3 special
notes, and a structural Change outline. See `docs/agents/pull-requests.md`.
