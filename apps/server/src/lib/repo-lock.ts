/**
 * Minimal per-key async mutex: serializes probe-then-commit sections (sync
 * removable pre-check → reconcile transaction) so concurrent syncs of one
 * repo cannot interleave Docker probes and row deletes. Process-local by
 * design — a single Bun process owns the SQLite file and the in-memory
 * activity store. Out-of-band Docker changes (another host mutating the
 * daemon) remain best-effort; the fail-closed probe + tx status guard still
 * apply there.
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
