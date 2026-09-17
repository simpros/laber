# laber

laber manages self-hosted Docker Compose stacks from a web UI.

- **Stack**: one Compose project (`composePath`, `projectName`, env vars) deployed,
  stopped, restarted, or pulled through `stack-manager.ts` (`deployStack`), with
  streamed command output. Repositories can be synced from git before deploy.
- **Core stack**: the built-in stack managed via `core-stack.ts` (config load/save
  plus deploy/stop/restart), backed by rows in `@laber/db`.
- **Secrets**: stored server-side; the UI only ever sees `hasValue`. Saving `null`
  leaves a secret unchanged, `""` clears it.
- **Activity**: every deploy/stop/sync records an activity (`running` /
  `success` / `error`) with streamed output, broadcast to subscribers.
- **Web app**: `apps/web` (`@laber/web`, SvelteKit 2 + Svelte 5, `adapter-node`)
  serves the UI and currently hosts the server modules above; local dev runs
  Postgres + Mailpit via `docker-compose.yml` (`DATABASE_URL`, `BETTER_AUTH_*`,
  `SMTP_*` in `.env`).
