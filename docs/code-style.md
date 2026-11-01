# Code style

## Tooling

- Prettier formats (`bun run format`); `@laber/eslint-config` lints.
- TypeScript `strict`; `import type` for type-only imports.

## Comments

State the why only: invariants, ordering/locking, observed external behaviour, workarounds, security or perf tradeoffs, unexplained constants.

- Don't restate what the code says; no signature or type echoes.
- No ticket, issue, PR or people references; no history narration ("previously", "after the refactor").
- No commented-out code; git is the archive.
- One line beats three. A paragraph is a decision: put it in `docs/adr/` if it qualifies.
- A comment that contradicts the code is a bug; fix one of the two.
- No decoration: "hack", "for now", "should be fine", emoji.
