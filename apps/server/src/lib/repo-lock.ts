/**
 * Minimal per-key async mutex over repo ids. Every in-process writer of
 * repo-scoped stack rows or the presence inputs the removable rule reads
 * holds this lock across its whole probe→commit section:
 *
 * - sync/register materialize (Docker-aware removable probe → reconcile tx)
 * - repo delete (sequential `down`s → row-delete tx)
 * - stack deploy (`compose up` → `stacks.status` commit)
 * - stack stop/restart/pull (compose run → optional `stacks.status` commit)
 *
 * That closes the probe→commit window in-process with a single mechanism
 * instead of a second status-only gate inside the sync transaction (which
 * cannot await Docker and would be a split-brain twin of the same rule).
 * Process-local by design — a single Bun process owns the SQLite file and
 * the in-memory activity store. Out-of-band Docker changes (another host
 * mutating the daemon) remain best-effort; the fail-closed probe still
 * applies there.
 *
 * Never nest: holders must not call another holder for the same repo id.
 */
const tails = new Map<string, Promise<void>>();

export async function withRepoLock<T>(
  repoId: string,
  fn: () => Promise<T>
): Promise<T> {
  const prev = tails.get(repoId) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  tails.set(repoId, current);
  await prev;
  try {
    return await fn();
  } finally {
    release();
    if (tails.get(repoId) === current) {
      // `current` already resolved; drop the entry so the map cannot grow.
      // Queued waiters hold their own chained promise.
      tails.delete(repoId);
    }
  }
}
