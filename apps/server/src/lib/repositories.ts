import { randomUUID } from "crypto";
import { existsSync, rmSync } from "fs";
import { db, repositories, stacks } from "@laber/db";
import { eq } from "drizzle-orm";
import {
  cloneRepo,
  pullRepo,
  discoverStacks,
  type DiscoveredStack,
} from "./git";
import { reconcileStacksTx } from "./stack-reconcile";
import type { StackTx } from "./db-tx";
import { getRepoDir, getComposePath } from "./config";
import { stopStack } from "./stacks";
import {
  assertStackRemovable,
  countProjectContainers,
} from "./stack-presence";
import { runLoggedAction } from "./logged-action";
import { NotFoundError, ActionFailedError } from "./errors";

export type AddRepositoryInput = {
  name: string;
  url: string;
  branch: string;
  stacksPath: string;
  sshPrivateKey: string | null;
};

type RemoteTree = Pick<
  typeof repositories.$inferSelect,
  "url" | "branch" | "sshPrivateKey"
>;

/**
 * Ensure the local git tree exists (fresh clone, or clone-if-missing /
 * pull). Throws `ActionFailedError` on operational git failures — the
 * detail line is already streamed, so `runLoggedAction` maps the throw to
 * the contextual failure message. Domain errors are never produced here.
 */
async function ensureRemoteTree(
  repoDir: string,
  remote: RemoteTree,
  onOutput: (chunk: string) => void,
  fresh: boolean
): Promise<void> {
  try {
    if (fresh || !existsSync(repoDir)) {
      await cloneRepo(
        remote.url,
        repoDir,
        remote.branch,
        remote.sshPrivateKey ?? undefined
      );
    } else {
      await pullRepo(repoDir, remote.sshPrivateKey ?? undefined);
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    onOutput(`Sync failed: ${message}\n`);
    throw new ActionFailedError("Sync failed");
  }
}

/**
 * One shared clone/sync pipeline: ensure the local git tree, discover
 * stacks, then apply discovery inside a single transaction. `fresh` selects
 * clone-vs-pull wording and wipes a failed fresh clone's dir; each caller
 * only supplies what its transaction writes and what it returns.
 */
async function materializeRepoTree<T>(options: {
  title: string;
  action: string;
  repoDir: string;
  remote: RemoteTree;
  stacksPath: string;
  fresh: boolean;
  failureMessage: string;
  /**
   * Async pre-commit check after discovery, before the transaction (the
   * sync drizzle tx itself cannot await — e.g. no Docker probe in there).
   * Sync uses it for the Docker-aware removable check; clone has none.
   */
  beforeApply?: (discovered: DiscoveredStack[]) => Promise<void>;
  applyDiscovery: (
    tx: StackTx,
    discovered: DiscoveredStack[],
    onOutput: (chunk: string) => void
  ) => { summary: string; result: T };
}): Promise<T> {
  // The discovered value flows out through the run's return type — no
  // out-of-band variable, no boolean, no cast. `run` throws on failure, so
  // reaching the return below proves success to the type system.
  const { value } = await runLoggedAction<T>({
    title: options.title,
    action: options.action,
    failureMessage: options.failureMessage,
    run: async (onOutput) => {
      onOutput(
        options.fresh
          ? `Cloning ${options.remote.url} (branch: ${options.remote.branch})...\n`
          : `Pulling latest changes from ${options.remote.url}...\n`
      );
      try {
        await ensureRemoteTree(
          options.repoDir,
          options.remote,
          onOutput,
          options.fresh
        );
      } catch (e) {
        if (options.fresh) {
          rmSync(options.repoDir, { recursive: true, force: true });
        }
        throw e;
      }
      onOutput(
        options.fresh
          ? "Clone complete. Discovering stacks...\n"
          : "Pull complete. Discovering stacks...\n"
      );

      const discovered = await discoverStacks(
        options.repoDir,
        options.stacksPath
      );
      await options.beforeApply?.(discovered);
      // The sync transaction returns the callback's value (and rolls back on
      // throw), so there is nothing to smuggle out or assert.
      const applied = db.transaction((tx) =>
        options.applyDiscovery(tx, discovered, onOutput)
      );
      return { output: applied.summary, value: applied.result };
    },
  });

  return value;
}

/**
 * Shared reconcile → summarize step inside the caller's transaction.
 * Reconcile failures propagate (a deliberate `ConflictError` must not be
 * flattened into a 500); `runLoggedAction` finishes the activity on throw.
 */
function reconcileAndSummarizeTx(
  tx: StackTx,
  repoId: string,
  discovered: DiscoveredStack[],
  onOutput: (chunk: string) => void
) {
  const reconciled = reconcileStacksTx(tx, repoId, discovered);
  const summary =
    `Discovered ${discovered.length} stack(s)` +
    ` (${reconciled.added} new, ${reconciled.updated} updated` +
    (reconciled.removed.length > 0
      ? `, ${reconciled.removed.length} no longer in repo: ${reconciled.removed.join(", ")}`
      : "") +
    ")\n";
  onOutput(summary);
  return { reconciled, summary };
}

export async function listRepositories() {
  const [repos, allStacks] = await Promise.all([
    db.select().from(repositories),
    db.select().from(stacks),
  ]);

  return { repositories: repos, stacks: allStacks };
}

export async function cloneAndRegisterRepo(input: AddRepositoryInput) {
  // Clone first with a pre-generated id; the DB row is only inserted
  // after the clone succeeds, so a failed clone leaves no ghost repo.
  const repoId = randomUUID();
  const repoDir = getRepoDir(repoId);

  try {
    const discovered = await materializeRepoTree({
      title: `Cloning ${input.name}`,
      action: "clone",
      repoDir,
      remote: {
        url: input.url,
        branch: input.branch,
        sshPrivateKey: input.sshPrivateKey,
      },
      stacksPath: input.stacksPath,
      fresh: true,
      failureMessage: `Failed to clone repository ${input.name}`,
      applyDiscovery: (tx, discoveredStacks, onOutput) => {
        // One transaction for the repo insert *and* the stack reconcile:
        // any throw rolls the row back, and the dir is wiped below so no
        // committed repo survives without stacks (and vice versa).
        tx.insert(repositories)
          .values({
            id: repoId,
            name: input.name,
            url: input.url,
            branch: input.branch,
            stacksPath: input.stacksPath,
            sshPrivateKey: input.sshPrivateKey,
            lastSyncedAt: new Date(),
          })
          .run();
        const { summary } = reconcileAndSummarizeTx(
          tx,
          repoId,
          discoveredStacks,
          onOutput
        );
        return { summary, result: discoveredStacks.length };
      },
    });

    return { discovered };
  } catch (e) {
    rmSync(repoDir, { recursive: true, force: true });
    throw e;
  }
}

export async function syncRepository(id: string) {
  const [repo] = await db
    .select()
    .from(repositories)
    .where(eq(repositories.id, id))
    .limit(1);
  if (!repo) throw new NotFoundError("Repository not found");

  const counts = await materializeRepoTree({
    title: `Syncing ${repo.name}`,
    action: "sync",
    repoDir: getRepoDir(repo.id),
    remote: repo,
    stacksPath: repo.stacksPath,
    fresh: false,
    failureMessage: `Failed to sync repository ${repo.name}`,
    // The one removable-stack rule, shared with delete's intent: refuse to
    // reconcile away a stack that is still deployed *or* still has running
    // containers (covers a stale status column). Runs before the tx because
    // the sync transaction cannot await a Docker probe; the
    // `status === "deployed"` guard inside `reconcileStacksTx` stays as the
    // transactional last resort against a status flip mid-sync.
    beforeApply: async (discoveredStacks) => {
      const names = new Set(discoveredStacks.map((s) => s.name));
      const existing = await db
        .select()
        .from(stacks)
        .where(eq(stacks.repositoryId, repo.id));
      for (const stack of existing) {
        if (!names.has(stack.name)) await assertStackRemovable(stack);
      }
    },
    applyDiscovery: (tx, discoveredStacks, onOutput) => {
      // Reconcile and `lastSyncedAt` commit together: stacks can never
      // change while the timestamp stays stale.
      const { reconciled, summary } = reconcileAndSummarizeTx(
        tx,
        repo.id,
        discoveredStacks,
        onOutput
      );
      tx.update(repositories)
        .set({ lastSyncedAt: new Date(), updatedAt: new Date() })
        .where(eq(repositories.id, repo.id))
        .run();
      return { summary, result: reconciled };
    },
  });

  return {
    newStacks: counts.added,
    updatedStacks: counts.updated,
    removedStacks: counts.removed,
  };
}

export async function deleteRepository(id: string) {
  const [repo] = await db
    .select()
    .from(repositories)
    .where(eq(repositories.id, id))
    .limit(1);
  if (!repo) throw new NotFoundError("Repository not found");

  const repoStacks = await db
    .select()
    .from(stacks)
    .where(eq(stacks.repositoryId, id));

  // Docker first, hard: every stack comes down before any row is deleted.
  // `down` is the gate — there is no status refuse and no soft container
  // probe here. Teardown reuses the logged stop path, so each stack gets an
  // activity, a deployment log, and an honest status transition
  // ("stopped", or "error" on partial failure) before rows move. A `down`
  // throw aborts with no DB change, so rows are never deleted while
  // containers may still be running — and a partial failure leaves a status
  // sync understands instead of a sync dead-end. (Sync keeps the shared
  // `assertStackRemovable` check because sync does not bring stacks down;
  // delete does, so it needs no pre-gate.)
  for (const stack of repoStacks) {
    const composePath = getComposePath(
      repo.id,
      stack.relativePath,
      stack.composeFile
    );
    if (!existsSync(composePath)) {
      // No compose project to bring down (dir removed out of band). Fail
      // closed: an unreadable daemon must not read as "no containers" —
      // that would delete rows while live containers keep running. And a
      // missing file never wedges the repo undeletable either.
      let running: number;
      try {
        running = await countProjectContainers(stack.name);
      } catch (e) {
        throw new ActionFailedError(
          `Failed to delete repository: cannot verify running containers for stack ${stack.name} (${e instanceof Error ? e.message : "unknown error"}); remove them manually, then retry`
        );
      }
      if (running > 0) {
        throw new ActionFailedError(
          `Failed to delete repository: stack ${stack.name} still has running containers but its compose file is gone; remove them manually, then retry`
        );
      }
      continue;
    }
    try {
      await stopStack(stack.name);
    } catch (e) {
      throw new ActionFailedError(
        `Failed to delete repository: could not bring down stack ${stack.name} (${e instanceof Error ? e.message : "unknown error"})`
      );
    }
  }

  db.transaction((tx) => {
    tx.delete(stacks).where(eq(stacks.repositoryId, id)).run();
    tx.delete(repositories).where(eq(repositories.id, id)).run();
  });

  const warnings: string[] = [];
  try {
    rmSync(getRepoDir(id), { recursive: true, force: true });
  } catch (e) {
    warnings.push(
      `Repository files were left on disk: ${e instanceof Error ? e.message : "unknown error"}`
    );
  }

  return { success: true, warnings };
}
