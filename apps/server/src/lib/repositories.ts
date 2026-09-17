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
import {
  reconcileStacksTx,
  type ReconcileCounts,
} from "./stack-reconcile";
import type { StackTx } from "./db-tx";
import { getRepoDir } from "./config";
import { teardownStackProject } from "./compose-actions";
import { assertStackRemovable } from "./stack-presence";
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
  const remote: RemoteTree = {
    url: input.url,
    branch: input.branch,
    sshPrivateKey: input.sshPrivateKey,
  };

  try {
    const { value: discovered } = await runLoggedAction<number>({
      title: `Cloning ${input.name}`,
      action: "clone",
      failureMessage: `Failed to clone repository ${input.name}`,
      run: async (onOutput) => {
        onOutput(`Cloning ${remote.url} (branch: ${remote.branch})...\n`);
        await ensureRemoteTree(repoDir, remote, onOutput, true);
        onOutput("Clone complete. Discovering stacks...\n");

        const discoveredStacks = await discoverStacks(
          repoDir,
          input.stacksPath
        );
        // One transaction for the repo insert *and* the stack reconcile:
        // any throw rolls the row back, so no committed repo survives
        // without stacks (and vice versa).
        const applied = db.transaction((tx) => {
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
        });
        return { output: applied.summary, value: applied.result };
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

  const { value: counts } = await runLoggedAction<ReconcileCounts>({
    title: `Syncing ${repo.name}`,
    action: "sync",
    failureMessage: `Failed to sync repository ${repo.name}`,
    run: async (onOutput) => {
      onOutput(`Pulling latest changes from ${repo.url}...\n`);
      await ensureRemoteTree(getRepoDir(repo.id), repo, onOutput, false);
      onOutput("Pull complete. Discovering stacks...\n");

      const discoveredStacks = await discoverStacks(
        getRepoDir(repo.id),
        repo.stacksPath
      );
      // The one removable-stack rule, shared with delete's intent: refuse to
      // reconcile away a stack that is still deployed *or* still has running
      // containers (covers a stale status column). Runs before the tx because
      // the sync transaction cannot await a Docker probe; the
      // `status === "deployed"` guard inside `reconcileStacksTx` stays as the
      // transactional last resort against a status flip mid-sync.
      const names = new Set(discoveredStacks.map((s) => s.name));
      const existing = await db
        .select()
        .from(stacks)
        .where(eq(stacks.repositoryId, repo.id));
      for (const stack of existing) {
        if (!names.has(stack.name)) await assertStackRemovable(stack);
      }
      // Reconcile and `lastSyncedAt` commit together: stacks can never
      // change while the timestamp stays stale.
      const applied = db.transaction((tx) => {
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
      });
      return { output: applied.summary, value: applied.result };
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
  // probe here. Teardown goes through the logged project teardown (the same
  // `downProject` primitive stop uses, which needs no compose file), so each
  // stack gets an activity, a deployment log, and an honest status
  // transition ("stopped", or "error" on partial failure) before rows move.
  // A `down` throw aborts with no DB change, so rows are never deleted while
  // containers may still be running — and a partial failure leaves a status
  // sync understands instead of a sync dead-end. (Sync keeps the shared
  // `assertStackRemovable` check because sync does not bring stacks down;
  // delete does, so it needs no pre-gate.)
  for (const stack of repoStacks) {
    try {
      await teardownStackProject(stack.name);
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
