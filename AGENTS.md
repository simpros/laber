# AGENTS.md

laber: Bun + Turborepo TypeScript monorepo. Elysia API (`apps/server`, Eden client in `packages/api-client`), React SPA (`apps/web`: Vite, TanStack, Tailwind, `@laber/ui`), SQLite via Drizzle (`packages/db`), better-auth (`packages/auth`). See `README.md` for layout.

## Commands (repo root)

- `bun run dev` / `build` / `check` / `lint` / `test` / `test:e2e` / `format`
- Server tests need a ~60s timeout.
- Single package: `bun run --filter <pkg> <task>`.

## Done means

`lint`, `check`, `test`, `build` green; `test:e2e` for web or API changes; `bun run verify:toolchain` if Bun versions were touched. SQLite only: no Postgres services, deps or docs.

## Conventions

- Code style and comments: `docs/code-style.md`.
- ADRs in `docs/adr/` only for decisions that are hard to understand and hard to revert (e.g. SQLite-only, single core-key table). Never for style or tooling.
- Issues: GitHub `simpros/laber` via `gh` (`docs/agents/issue-tracker.md`).
- PRs: use the `visual-pr` skill for every PR body, overriding its explicit-invoke-only default. Save the body to `.humanlayer/tasks/<slug>/pr-description.md`, then `gh pr edit <n> --body-file <path>`.
