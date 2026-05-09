# SvelteKit Template

Opinionated Bun + Turbo monorepo template for building a SvelteKit app with shared packages.

## Stack

- SvelteKit
- Svelte 5
- Bun workspaces
- Turborepo
- Tailwind CSS
- Better Auth
- Drizzle ORM

## Apps and Packages

- `apps/web` - main SvelteKit app
- `packages/ui` - shared UI package
- `packages/auth` - auth helpers
- `packages/db` - database config and schema output
- `packages/logging` - shared logging utilities
- `packages/eslint-config` - shared ESLint config
- `packages/typescript-config` - shared TypeScript config
- `packages/tailwind-config` - shared Tailwind config

## Quick Start

```bash
bun install
cp .env.example .env
bun run dev
```

## Common Commands

```bash
bun run dev
bun run lint
bun run check
bun run build
bun run test
```

## Notes

- `bun.lock` is committed for reproducible template installs.
- CI runs lint, type checks, and build on pull requests and `main`.
- Repo-local agent skills are included under `.agents/skills` so downstream repos keep the same Svelte guidance.
