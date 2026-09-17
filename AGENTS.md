# AGENTS.md

laber is a Bun + Turborepo monorepo (`apps/*`, `packages/*`) in TypeScript.

The app is migrating from SvelteKit to an Elysia backend + React SPA + SQLite (tracked in issues #4–#7). Current truth on this tree: SvelteKit shell in `apps/web`, Postgres locally via `docker-compose.yml` — SQLite is the migration target, not the current store.

## Agent skills

### Issue tracker

Issues are tracked as GitHub issues on `simpros/laber`, via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default label vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context convention: one `CONTEXT.md` + `docs/adr/` at the repo root (neither exists yet — created lazily by `/domain-modeling`). See `docs/agents/domain.md`.
