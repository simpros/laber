import { deployedRemovalConflict } from "./stack-presence";
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

function isUniqueViolation(e: unknown): boolean {
  const message = e instanceof Error ? e.message : String(e);
  return (
    /UNIQUE constraint failed/i.test(message) ||
    /SQLITE_CONSTRAINT_UNIQUE/i.test(message)
  );
}

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
  // This status guard is the transactional last resort for the shared
  // deployed-removal rule (see `deployedRemovalConflict`); the async
  // pre-check covers the Docker-aware half before the tx.
  const deployedRemoved = removed
    .filter((s) => s.status === "deployed")
    .map((s) => s.name);
  if (deployedRemoved.length > 0) {
    throw deployedRemovalConflict(deployedRemoved);
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
    // Global UNIQUE on `stacks.name`: the API keys every stack by bare name
    // (and Docker `--project-name` collides on it), so a discovered name
    // owned by another repo is a 409 with a product message — never a raw
    // SQLite 500. Checked here (register and sync share this path) plus a
    // narrow constraint catch below for the race between check and insert.
    const addedNames = added.map((s) => s.name);
    const dupInBatch = addedNames.filter(
      (n, i) => addedNames.indexOf(n) !== i
    );
    if (dupInBatch.length > 0) {
      throw new ConflictError(
        `Stack name(s) already registered: ${[...new Set(dupInBatch)].join(", ")}`
      );
    }
    const owned = tx
      .select({ name: stacks.name })
      .from(stacks)
      .where(inArray(stacks.name, addedNames))
      .all();
    // Rows for this repo with these names cannot exist here: `added` means
    // "not in this repo" — so any hit is owned by another repo.
    if (owned.length > 0) {
      throw new ConflictError(
        `Stack name(s) already registered: ${owned.map((r) => r.name).join(", ")}`
      );
    }
    try {
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
    } catch (e) {
      if (isUniqueViolation(e)) {
        throw new ConflictError(
          `Stack name(s) already registered: ${addedNames.join(", ")}`
        );
      }
      throw e;
    }
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
