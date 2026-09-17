import { ConflictError } from "./errors";
import { stacks } from "@laber/db";
import type { StackTx } from "./db-tx";
import type { DiscoveredStack } from "./git";
import { and, eq, inArray } from "drizzle-orm";

export type ReconcileCounts = {
  added: number;
  updated: number;
  removed: string[];
};

/**
 * Stack-table reconcile: apply filesystem discovery to the stacks table.
 * This is persistence policy, not VCS work — it lives here (next to
 * repositories, not in `git.ts`) so the VCS module never imports the stacks
 * table. Always called inside the caller's transaction (sync drizzle-tx
 * style: reads via `.all()`, writes via `.run()`). Throwing rolls back
 * everything the outer transaction did — repo insert and `lastSyncedAt`
 * included — so callers stay atomic by construction.
 */
export function reconcileStacksTx(
  tx: StackTx,
  repoId: string,
  discovered: DiscoveredStack[]
): ReconcileCounts {
  const existing = tx
    .select()
    .from(stacks)
    .where(eq(stacks.repositoryId, repoId))
    .all();
  const existingByName = new Map(existing.map((s) => [s.name, s]));
  const discoveredByName = new Map(discovered.map((s) => [s.name, s]));

  const added = discovered.filter((s) => !existingByName.has(s.name));
  const changed = discovered.filter((s) => {
    const prev = existingByName.get(s.name);
    return (
      prev &&
      (prev.relativePath !== s.relativePath ||
        prev.composeFile !== s.composeFile)
    );
  });
  const removed = existing.filter((s) => !discoveredByName.has(s.name));
  const removedNames = removed.map((s) => s.name);

  // Removal policy: refuse to silently orphan a deployed stack; otherwise
  // delete the stale rows (env/secrets cascade, logs detach) in the same
  // transaction as the adds/updates so sync never leaves zombies behind.
  // This status guard is the transactional last resort: sync pre-checks the
  // same rule Docker-aware via `assertStackRemovable` (status *and* live
  // containers) before the tx, but the probe cannot run inside a sync
  // drizzle transaction — so this stays to catch a status flip mid-sync.
  const deployedRemoved = removed
    .filter((s) => s.status === "deployed")
    .map((s) => s.name);
  if (deployedRemoved.length > 0) {
    throw new ConflictError(
      `Cannot sync: stack(s) no longer in repo but still deployed: ${deployedRemoved.join(", ")}. Stop them before syncing.`
    );
  }

  // NOTE: drizzle only executes queries that are awaited (async tx) or
  // finished with `.run()` (sync tx). Bare `tx.delete(...)` chains are
  // lazy and would silently persist nothing.
  if (removedNames.length > 0) {
    tx.delete(stacks)
      .where(
        and(
          eq(stacks.repositoryId, repoId),
          inArray(stacks.name, removedNames)
        )
      )
      .run();
  }
  if (added.length > 0) {
    tx.insert(stacks)
      .values(
        added.map((s) => ({
          repositoryId: repoId,
          name: s.name,
          relativePath: s.relativePath,
          composeFile: s.composeFile,
        }))
      )
      .run();
  }
  for (const s of changed) {
    tx.update(stacks)
      .set({
        relativePath: s.relativePath,
        composeFile: s.composeFile,
        updatedAt: new Date(),
      })
      .where(and(eq(stacks.repositoryId, repoId), eq(stacks.name, s.name)))
      .run();
  }

  return {
    added: added.length,
    updated: changed.length,
    removed: removedNames,
  };
}
