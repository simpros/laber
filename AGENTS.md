# Laber - Homelab Stack Manager

## Project Structure

Turborepo monorepo using **Bun** as the package manager (`bun@1.3.10`).

- `apps/web` - SvelteKit 5 app (adapter-node, Svelte 5 runes API)
- `packages/auth` - Authentication (better-auth)
- `packages/db` - Database schema and migrations (Drizzle ORM, bun-sqlite)
- `packages/ui` - Shared UI components
- `packages/logging` - Logging utilities
- `packages/eslint-config` - Shared ESLint config
- `packages/typescript-config` - Shared TypeScript config
- `packages/tailwind-config` - Shared Tailwind CSS config

## Commands

All commands are run from the repo root:

| Command                | Description                       |
| ---------------------- | --------------------------------- |
| `bun run dev`          | Start dev server (all workspaces) |
| `bun run build`        | Build all workspaces              |
| `bun run lint`         | Lint all workspaces               |
| `bun run check`        | Type-check all workspaces         |
| `bun run test`         | Run tests across all workspaces   |
| `bun run format`       | Format code with Prettier         |
| `bun run format:check` | Check formatting                  |
| `bun run db:generate`  | Generate Drizzle migrations       |
| `bun run db:migrate`   | Run Drizzle migrations            |

## Verification

After making changes, run:

1. `bun run test` - Unit & component tests
2. `bun run check` - Type checking
3. `bun run lint` - Linting
4. `bun run build` - Build

## Testing

Uses **Bun's built-in test runner** (`bun test`) for unit and component tests, and **Playwright** for E2E tests.

| Command                | Description                          |
| ---------------------- | ------------------------------------ |
| `bun run test`         | Unit & component tests (all packages)|
| `bun run test:e2e`     | E2E tests (Playwright, apps/web)     |
| `bun run test:integration` | Integration tests                |

### Test file conventions

- Unit tests: `*.test.ts` (co-located with source files)
- Integration tests: `*.integration-test.ts`
- E2E tests: `*.e2e.ts` (in `apps/web/tests/`)
- Component tests use `@testing-library/svelte` + `happy-dom`
- Svelte compilation handled by `svelte-test-setup.ts` (Bun plugin preloaded via `bunfig.toml`)
- SvelteKit module mocks: `apps/web/src/test-helpers/sveltekit-mocks.ts`

## Frontend (apps/web)

- **Framework**: SvelteKit 5 with Svelte 5 runes (`$props()`, `$state()`, etc.)
- **Styling**: Tailwind CSS v4 (CSS-first config via `@theme` in `src/app.css`)
- **Theming**: Dark/light mode via `.dark` class on `<html>`. Color tokens are CSS custom properties defined in `@theme` (dark defaults) with light overrides in `html:not(.dark)`. All components use semantic token classes (`bg-surface-2`, `text-text-primary`, `border-border`, etc.) that automatically respect the active theme.
- **Fonts**: DM Sans (body) + JetBrains Mono (code)
- **Shared Components** (`@laber/ui`): Icon, Button, Card, CardHeader, Alert, StatusBadge, AuthLayout
- **Shared Utilities** (`$lib/utils.ts`): statusColor, containerStatusBg, statusBadge, timeAgo
- **Server Config** (`$lib/server/config.ts`): DATA_DIR, getRepoDir, getComposePath, getStackAndRepo

## Code Conventions

- Use Svelte 5 runes API (`$props()`, `$state()`, `$derived()`, etc.) - not legacy Svelte 4 stores
- Use `$lib/` alias for imports from `src/lib/`
- Server-only code goes in `$lib/server/`
- Follow existing component patterns: use `@laber/ui` (`packages/ui`) for shared UI, Tailwind utility classes, semantic color tokens
- Use the `Icon` component for inline SVGs (wraps `<svg viewBox="0 0 16 16">` with consistent sizing)
- Use `$lib/server/config.ts` for shared server constants (DATA_DIR, path helpers, stack+repo lookups)
- Do not add comments unless asked
