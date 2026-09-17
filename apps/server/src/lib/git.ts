import simpleGit from "simple-git";
import { ConflictError } from "./errors";
import { stacks } from "@laber/db";
import type { StackTx } from "./db-tx";
import { and, eq, inArray } from "drizzle-orm";
import {
  mkdtempSync,
  writeFileSync,
  unlinkSync,
  readdirSync,
  existsSync,
} from "fs";
import { join } from "path";
import { tmpdir } from "os";

function withSshKey(
  sshKey: string | undefined,
  fn: (gitEnv: Record<string, string>) => Promise<void>
): Promise<void> {
  if (!sshKey) return fn({});

  const tmpDir = mkdtempSync(join(tmpdir(), "laber-ssh-"));
  const keyPath = join(tmpDir, "id_key");
  writeFileSync(keyPath, sshKey, { mode: 0o600 });

  const gitEnv = {
    GIT_SSH_COMMAND: `ssh -i ${keyPath} -o StrictHostKeyChecking=no`,
  };

  return fn(gitEnv).finally(() => {
    try {
      unlinkSync(keyPath);
    } catch {
      // ignore cleanup errors
    }
  });
}

export async function cloneRepo(
  url: string,
  targetDir: string,
  branch?: string,
  sshKey?: string
): Promise<void> {
  await withSshKey(sshKey, async (gitEnv) => {
    const git = simpleGit();
    const cloneOpts = ["--depth", "1"];
    if (branch) cloneOpts.push("--branch", branch);

    await git.env(gitEnv).clone(url, targetDir, cloneOpts);
  });
}

export async function pullRepo(
  repoDir: string,
  sshKey?: string
): Promise<void> {
  await withSshKey(sshKey, async (gitEnv) => {
    const git = simpleGit(repoDir);
    await git.env(gitEnv).pull();
  });
}

/**
 * Filesystem discovery only: which stack directories exist and which compose
 * file each one uses. Deliberately no compose parsing here — deploy re-parses
 * the compose file fresh (the only correctness-critical consumer), so a
 * cached network name would be a second source of truth deploy refuses to
 * trust. The `network_name` column still exists for the frozen SvelteKit
 * tree; this server neither reads nor writes it.
 */
export async function discoverStacks(
  repoDir: string,
  stacksPath: string
): Promise<
  Array<{
    name: string;
    relativePath: string;
    composeFile: string;
  }>
> {
  const fullPath = join(repoDir, stacksPath);
  if (!existsSync(fullPath)) return [];

  const entries = readdirSync(fullPath, { withFileTypes: true });
  const stacks: Array<{
    name: string;
    relativePath: string;
    composeFile: string;
  }> = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dirPath = join(fullPath, entry.name);

    for (const candidate of [
      "docker-compose.yaml",
      "docker-compose.yml",
    ]) {
      const composePath = join(dirPath, candidate);
      if (existsSync(composePath)) {
        stacks.push({
          name: entry.name,
          relativePath: join(stacksPath, entry.name),
          composeFile: candidate,
        });
        break;
      }
    }
  }

  return stacks;
}

export type DiscoveredStack = Awaited<
  ReturnType<typeof discoverStacks>
>[number];

export type ReconcileCounts = {
  added: number;
  updated: number;
  removed: string[];
};

/**
 * Apply the reconcile inside the caller's transaction (sync drizzle-tx
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
