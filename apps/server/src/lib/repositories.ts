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
import { downStackProject } from "./compose-actions";
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

/**
 * Shared git-failure mapping: the detail line is already streamed, so the
 * throw maps to the contextual failure message at the edge. The verb names
 * the operation that failed — clone and sync share the shape, not the
 * product name. Domain errors are never produced here.
 */
function gitFailure(
  onOutput: (chunk: string) => void,
  e: unknown,
  verb: "Clone failed" | "Sync failed"
): never {
  const message = e instanceof Error ? e.message : "Unknown error";
  onOutput(`${verb}: ${message}\n`);
  throw new ActionFailedError(verb);
}

/** Fresh clone: register path (fails if the remote cannot be cloned). */
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

/** Clone-if-missing, else pull: sync path. The missing-dir case is exactly
 * a clone, so it delegates instead of re-implementing the clone shell. */
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
 * Live-repo check under `withRepoLock`: a concurrent delete may have
 * committed between the early lookup and the locked section. Confirm the
 * repo still exists before probing/reconciling (sync) or tearing down
 * (delete) — otherwise sync would `update` a gone row and `insert` stacks
 * against a deleted `repository_id` (raw FK failure, not a clean 404).
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

/**
 * Shared reconcile → summarize step inside the caller's transaction.
 * Reconcile failures propagate (a deliberate `ConflictError` must not be
 * flattened into a 500); `runActivity` finishes the activity on throw.
 */
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

export async function listRepositories() {
  const [repos, allStacks] = await Promise.all([
    db.select().from(repositories),
    db.select().from(stacks),
  ]);

  return { repositories: repos, stacks: allStacks };
}

export async function cloneAndRegisterRepo(input: AddRepositoryInput) {
  // Clone first with a pre-generated id (the same `nanoid` generator the
  // schema `$defaultFn` uses — one ID dialect for the table); the DB row is
  // only inserted after the clone succeeds, so a failed clone leaves no
  // ghost repo.
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
        // Long I/O outside the lock; filesystem discovery is cheap, so it
        // is sampled inside the lock below — the tx commits the fresh tree,
        // never a stale pre-lock snapshot.
        onOutput(`Cloning ${input.url} (branch: ${input.branch})...\n`);
        await cloneRemoteTree(repoDir, remote, onOutput);
        onOutput("Clone complete. Discovering stacks...\n");

        // Fresh id: no contention possible, but the insert + reconcile
        // still commit together so a failed register leaves no ghost repo.
        const applied = await withRepoLock(repoId, async () => {
          const discovered = await discoverStacks(repoDir, input.stacksPath);
          return db.transaction((tx) => {
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
            const { reconciled, summary } = reconcileAndSummarizeTx(
              tx,
              repoId,
              discovered,
              // Fresh id: no rows exist yet, so nothing disappears — no
              // clearance needed (reconcile only requires one for removals).
              undefined,
              onOutput
            );
            return {
              summary,
              result: { reconciled, total: discovered.length },
            };
          });
        });
        return { output: applied.summary, value: applied.result };
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
      // Long I/O outside the lock; discovery is re-sampled inside the lock
      // so two overlapping syncs cannot commit a stale set (A discovers,
      // B removes, A re-inserts).
      onOutput(`Pulling latest changes from ${repo.url}...\n`);
      const repoDir = getRepoDir(repo.id);
      await pullOrCloneRemoteTree(repoDir, repo, onOutput);
      onOutput("Pull complete. Discovering stacks...\n");

      // Serialized per repo: the Docker-aware removable probe and the
      // reconcile transaction commit under one lock, so a concurrent repo
      // delete cannot interleave a teardown or a row delete between the
      // probe and the commit. (Out-of-band daemon changes remain
      // best-effort — fail-closed probe still applies there.)
      const applied = await withRepoLock(repo.id, async () => {
        // Inside the lock: confirm the repo survived a concurrent delete
        // (see `requireLiveRepo`) before probing and reconciling.
        await requireLiveRepo(repo.id);
        // Fresh discovery under the lock: the reconcile input, the probe
        // set, and the tx commit all read the same tree.
        const discovered = await discoverStacks(repoDir, repo.stacksPath);
        // Refuse to reconcile away a stack that still has running
        // containers (the fail-closed Docker probe — `stacks.status` is
        // UI/history and not consulted). Runs before the tx because the
        // sync transaction cannot await a Docker probe. The probe mints a
        // clearance for exactly the disappearing set, and reconcile
        // requires it — no path can delete rows without a probe the type
        // system saw. Independent probes run in parallel under the same
        // fail-closed rule.
        const names = new Set(discovered.map((s) => s.name));
        const existing = await db
          .select()
          .from(stacks)
          .where(eq(stacks.repositoryId, repo.id));
        const clearance = await RemovableClearance.clear(
          repo.id,
          existing.filter((stack) => !names.has(stack.name))
        );
        // Reconcile and the `lastSyncedAt` write commit together: stacks
        // can never change while the row stays stale.
        return db.transaction((tx) => {
          tx.update(repositories)
            .set({ lastSyncedAt: new Date(), updatedAt: new Date() })
            .where(eq(repositories.id, repo.id))
            .run();
          const { reconciled, summary } = reconcileAndSummarizeTx(
            tx,
            repo.id,
            discovered,
            clearance,
            onOutput
          );
          return { summary, result: { reconciled } };
        });
      });
      return { output: applied.summary, value: applied.result };
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

  // One logged action ("Deleting repo X"), sequential downs, then rows.
  // `down` is the gate — no status pre-check, no soft container probe: every
  // stack comes down before any row is deleted, and a `down` failure aborts
  // with no stack/repo row change, so rows are never deleted while
  // containers may still be running. Sequential (not allSettled) is
  // deliberate: fail-fast leaves one honest torn state — rows intact,
  // earlier projects down — with the failed stack named in the transcript,
  // instead of N independent per-stack activities plus an aggregate apology.
  // No per-stop `stacks.status` commits either: the rows disappear in the
  // transaction right after, so status flips would be writes to dead rows
  // (and lies on partial failure). The lock nests inside the activity `run`
  // (same as sync: transcript outside, removable mutations under the mutex),
  // so a sync probe→commit window cannot interleave the teardown or the row
  // delete. One rule for every repo mutation: long I/O may sit outside;
  // removable mutations always run under the lock inside the transcript.
  const { value } = await runActivity<{ warnings: string[] }>({
    title: `Deleting repository ${repo.name}`,
    failureMessage: `Failed to delete repository ${repo.name}`,
    run: async (onOutput) =>
      withRepoLock(id, async () => {
        // Re-read inside the lock: a sync may have added/removed stack rows
        // (or the repo row may be gone — same race as sync's pre-check)
        // between the early 404 above and this section. The teardown list
        // and the row delete below must match what the lock actually owns.
        const live = await requireLiveRepo(id);
        const repoStacks = await db
          .select()
          .from(stacks)
          .where(eq(stacks.repositoryId, id));

        for (const stack of repoStacks) {
          onOutput(`Bringing down ${stack.name}...\n`);
          try {
            // Same `downStackProject` primitive stop uses (not `runStackOp`:
            // delete already holds `withRepoLock` and would self-deadlock).
            await downStackProject(
              {
                projectName: stack.name,
                composePath: getComposePath(
                  stack.repositoryId,
                  stack.relativePath,
                  stack.composeFile
                ),
              },
              onOutput
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
