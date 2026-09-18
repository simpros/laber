/**
 * Per-repo mutex over removable-input mutations (sync/register probe→tx,
 * delete teardown→tx, deploy `up`, stop `down`, compose save). Process-local
 * by design; holders must never nest (delete uses `downProject` directly, never the locked `runStackOp`).
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
      // Drop the entry so the map cannot grow; waiters hold their own chained promise.
      tails.delete(repoId);
    }
  }
}
