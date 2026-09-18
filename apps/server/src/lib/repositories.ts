import { nanoid } from "nanoid";
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
import { getRepoDir, getComposePath } from "./config";
import { downProject } from "./compose-cli";
import { RemovableClearance } from "./stack-presence";
import { withRepoLock } from "./repo-lock";
import { runActivity } from "./logged-action";
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

/** Detail already streamed, so the throw maps to the contextual failure message at the edge. */
function gitFailure(
  onOutput: (chunk: string) => void,
  e: unknown,
  verb: "Clone failed" | "Sync failed"
): never {
  const message = e instanceof Error ? e.message : "Unknown error";
  onOutput(`${verb}: ${message}\n`);
  throw new ActionFailedError(verb);
}

async function cloneRemoteTree(
  repoDir: string,
  remote: RemoteTree,
  onOutput: (chunk: string) => void
): Promise<void> {
  try {
    await cloneRepo(
      remote.url,
      repoDir,
      remote.branch,
      remote.sshPrivateKey ?? undefined
    );
  } catch (e) {
    gitFailure(onOutput, e, "Clone failed");
  }
}

async function pullOrCloneRemoteTree(
  repoDir: string,
  remote: RemoteTree,
  onOutput: (chunk: string) => void
): Promise<void> {
  if (!existsSync(repoDir)) {
    await cloneRemoteTree(repoDir, remote, onOutput);
    return;
  }
  try {
    await pullRepo(repoDir, remote.sshPrivateKey ?? undefined);
  } catch (e) {
    gitFailure(onOutput, e, "Sync failed");
  }
}

/**
 * A concurrent delete may have committed between lookup and lock: re-check
 * before probing/reconciling, or sync would insert stacks against a deleted repo (raw FK failure, not 404).
 */
async function requireLiveRepo(id: string) {
  const [live] = await db
    .select()
    .from(repositories)
    .where(eq(repositories.id, id))
    .limit(1);
  if (!live) throw new NotFoundError("Repository not found");
  return live;
}

/** Reconcile failures propagate: a deliberate `ConflictError` must not flatten into a 500. */
function reconcileAndSummarizeTx(
  tx: StackTx,
  repoId: string,
  discovered: DiscoveredStack[],
  clearance: RemovableClearance | undefined,
  onOutput: (chunk: string) => void
) {
  const reconciled = reconcileStacksTx(tx, repoId, discovered, clearance);
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

/**
 * Shared lock → discover → clearance → tx door for register and sync: remote
 * I/O stays outside the lock, then discovery, probe, and commit share one lock and one transaction.
 */
async function applyDiscoveredRepo(opts: {
  repoId: string;
  repoDir: string;
  stacksPath: string;
  onOutput: (chunk: string) => void;
  expectRepo: boolean;
  clearanceFor?: (
    disappearing: (typeof stacks.$inferSelect)[]
  ) => Promise<RemovableClearance | undefined>;
  commitRepoRow: (tx: StackTx) => void;
}): Promise<{
  summary: string;
  reconciled: ReconcileCounts;
  total: number;
}> {
  return withRepoLock(opts.repoId, async () => {
    if (opts.expectRepo) await requireLiveRepo(opts.repoId);
    // Re-sampled under the lock so probe set, reconcile input, and tx commit read the same tree.
    const discovered = await discoverStacks(opts.repoDir, opts.stacksPath);
    const names = new Set(discovered.map((s) => s.name));
    const existing = await db
      .select()
      .from(stacks)
      .where(eq(stacks.repositoryId, opts.repoId));
    const clearance = await opts.clearanceFor?.(
      existing.filter((stack) => !names.has(stack.name))
    );
    return db.transaction((tx) => {
      opts.commitRepoRow(tx);
      const { reconciled, summary } = reconcileAndSummarizeTx(
        tx,
        opts.repoId,
        discovered,
        clearance,
        opts.onOutput
      );
      return { summary, reconciled, total: discovered.length };
    });
  });
}

export async function listRepositories() {
  const [repos, allStacks] = await Promise.all([
    db.select().from(repositories),
    db.select().from(stacks),
  ]);

  return { repositories: repos, stacks: allStacks };
}

export async function cloneAndRegisterRepo(input: AddRepositoryInput) {
  // Clone before inserting the row, so a failed clone leaves no ghost repo.
  const repoId = nanoid();
  const repoDir = getRepoDir(repoId);
  const remote: RemoteTree = {
    url: input.url,
    branch: input.branch,
    sshPrivateKey: input.sshPrivateKey,
  };

  try {
    const { value } = await runActivity<{
      reconciled: ReconcileCounts;
      total: number;
    }>({
      title: `Cloning ${input.name}`,
      failureMessage: `Failed to clone repository ${input.name}`,
      run: async (onOutput) => {
        // Long I/O outside the lock; the tx below commits the freshly discovered tree, never a stale pre-lock snapshot.
        onOutput(`Cloning ${input.url} (branch: ${input.branch})...\n`);
        await cloneRemoteTree(repoDir, remote, onOutput);
        onOutput("Clone complete. Discovering stacks...\n");

        // Fresh id owns no rows, so nothing disappears and no clearance is needed.
        const applied = await applyDiscoveredRepo({
          repoId,
          repoDir,
          stacksPath: input.stacksPath,
          onOutput,
          expectRepo: false,
          commitRepoRow: (tx) => {
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
          },
        });
        return {
          output: applied.summary,
          value: { reconciled: applied.reconciled, total: applied.total },
        };
      },
    });

    return { discovered: value.total };
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

  const { value } = await runActivity<{
    reconciled: ReconcileCounts;
  }>({
    title: `Syncing ${repo.name}`,
    failureMessage: `Failed to sync repository ${repo.name}`,
    run: async (onOutput) => {
      // Re-sampled inside the lock so overlapping syncs cannot commit a stale set.
      onOutput(`Pulling latest changes from ${repo.url}...\n`);
      const repoDir = getRepoDir(repo.id);
      await pullOrCloneRemoteTree(repoDir, repo, onOutput);
      onOutput("Pull complete. Discovering stacks...\n");

      // Probe and reconcile commit under one lock so a concurrent delete cannot
      // interleave teardown or row delete between them; `lastSyncedAt` commits with the reconcile.
      const applied = await applyDiscoveredRepo({
        repoId: repo.id,
        repoDir,
        stacksPath: repo.stacksPath,
        onOutput,
        expectRepo: true,
        clearanceFor: (disappearing) =>
          // Fail-closed Docker probe (`stacks.status` is not consulted); the sync tx cannot await Docker, so the probe mints the clearance reconcile requires.
          RemovableClearance.clear(repo.id, disappearing),
        commitRepoRow: (tx) => {
          tx.update(repositories)
            .set({ lastSyncedAt: new Date(), updatedAt: new Date() })
            .where(eq(repositories.id, repo.id))
            .run();
        },
      });
      return { output: applied.summary, value: { reconciled: applied.reconciled } };
    },
  });

  return {
    newStacks: value.reconciled.added,
    updatedStacks: value.reconciled.updated,
    removedStacks: value.reconciled.removed,
  };
}

export async function deleteRepository(id: string) {
  const [repo] = await db
    .select()
    .from(repositories)
    .where(eq(repositories.id, id))
    .limit(1);
  if (!repo) throw new NotFoundError("Repository not found");

  // `down` gates the row delete: every stack comes down first, fail-fast, and
  // the lock nests inside the transcript so a sync probe→commit cannot interleave.
  const { value } = await runActivity<{ warnings: string[] }>({
    title: `Deleting repository ${repo.name}`,
    failureMessage: `Failed to delete repository ${repo.name}`,
    run: async (onOutput) =>
      withRepoLock(id, async () => {
        // Re-read inside the lock: a sync may have changed the rows since the early 404.
        const live = await requireLiveRepo(id);
        const repoStacks = await db
          .select()
          .from(stacks)
          .where(eq(stacks.repositoryId, id));

        for (const stack of repoStacks) {
          onOutput(`Bringing down ${stack.name}...\n`);
          try {
            // Delete holds `withRepoLock`, so it uses the shared `downProject` directly — never the locked `runStackOp` (self-deadlock).
            await downProject(
              {
                projectName: stack.name,
                composePath: getComposePath(
                  stack.repositoryId,
                  stack.relativePath,
                  stack.composeFile
                ),
                onOutput,
              }
            );
          } catch (e) {
            throw new ActionFailedError(
              `Could not bring down stack ${stack.name} (${e instanceof Error ? e.message : "unknown error"})`
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

        const output =
          `Deleted repository ${live.name} (${repoStacks.length} stack(s) down)\n` +
          warnings.map((w) => `${w}\n`).join("");
        return { output, value: { warnings } };
      }),
  });

  return { success: true, warnings: value.warnings };
}
