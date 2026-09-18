import { ActionFailedError, ConflictError } from "./errors";
import { stacks } from "@laber/db";
import type { StackTx } from "./db-tx";
import type { DiscoveredStack } from "./git";
import type { RemovableClearance } from "./stack-presence";
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

function alreadyRegisteredConflict(
  tx: StackTx,
  repoId: string,
  addedNames: string[]
): ConflictError {
  const rows = tx
    .select({ name: stacks.name, repositoryId: stacks.repositoryId })
    .from(stacks)
    .where(inArray(stacks.name, addedNames))
    .all();
  const colliders = [
    ...new Set(
      rows
        .filter((r) => r.repositoryId !== repoId)
        .map((r) => r.name)
    ),
  ];
  return colliders.length > 0
    ? new ConflictError(
        `Stack name(s) already registered: ${colliders.join(", ")}`
      )
    : new ConflictError(
        "Stack name(s) already registered by another repository"
      );
}

export function reconcileStacksTx(
  tx: StackTx,
  repoId: string,
  discovered: DiscoveredStack[],
  clearance?: RemovableClearance
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

  if (removedNames.length > 0) {
    if (!clearance || clearance.repoId !== repoId) {
      throw new ActionFailedError(
        "Cannot sync: stale removable clearance for another repository; refusing to remove stacks"
      );
    }
    const cleared = new Set(clearance.names);
    const uncleared = removedNames.filter((n) => !cleared.has(n));
    if (uncleared.length > 0) {
      throw new ActionFailedError(
        `Cannot sync: stacks were never cleared for removal: ${uncleared.join(", ")}`
      );
    }
  }

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
    const addedNames = added.map((s) => s.name);
    const dupInBatch = addedNames.filter(
      (n, i) => addedNames.indexOf(n) !== i
    );
    if (dupInBatch.length > 0) {
      throw new ConflictError(
        `Stack name(s) already registered: ${[...new Set(dupInBatch)].join(", ")}`
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
        throw alreadyRegisteredConflict(tx, repoId, addedNames);
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
