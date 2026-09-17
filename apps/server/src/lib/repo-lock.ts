/**
 * Minimal per-key async mutex over repo ids. The holders are every mutation
 * of the removable rule's inputs (live containers for a compose project):
 *
 * - sync/register materialize (Docker-aware removable probe → reconcile tx)
 * - repo delete (sequential `down`s → row-delete tx)
 * - stack deploy (`up -d` creates the containers the probe reads)
 * - stack stop (`down` removes the containers the probe reads)
 *
 * That closes the probe→commit / teardown→delete window in-process with a
 * single mechanism instead of a second status-only gate inside the sync
 * transaction (which cannot await Docker and would be a split-brain twin of
 * the same rule). `stacks.status` is UI/history: restart/pull and the status
 * commits themselves never take this lock — the mutex is about containers,
 * not the column. Process-local by design — a single Bun process owns the
 * SQLite file and the in-memory activity store. Out-of-band Docker changes
 * (another host mutating the daemon) remain best-effort; the fail-closed
 * probe still applies there.
 *
 * Never nest: holders must not call another holder for the same repo id
 * (repo delete tears down via the shared `downStackProject` primitive
 * directly, never via the locked `runStackOp`, for exactly this reason).
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
