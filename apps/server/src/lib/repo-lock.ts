const tails = new Map<string, Promise<void>>();

// Process-local mutex; never nest (delete uses downProject, not locked runStackOp).
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
      tails.delete(repoId);
    }
  }
}
