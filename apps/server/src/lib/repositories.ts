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
import { assertStackRemovable } from "./stack-presence";
import { withRepoLock } from "./repo-lock";
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

/**
 * The one register/sync pipeline: ensure the local git tree → discover
 * stacks → optional pre-reconcile check → reconcile inside a transaction.
 * Register and sync differ only in data passed by the caller (which git op,
 * progress copy, repo-row write, and — for sync only — the Docker-aware
 * removable pre-check), so this function never branches on register-vs-sync
 * and never knows the word "sync". Returns the reconcile counts plus the
 * discovered total (register reports the total; sync reports the counts).
 */
async function materializeRepository(options: {
  repoId: string;
  title: string;
  action: string;
  failureMessage: string;
  ensure: "clone" | "pull";
  progressStart: string;
  progressDone: string;
  stacksPath: string;
  remote: RemoteTree;
  applyRepoRow: (tx: StackTx) => void;
  preReconcile?: (discovered: DiscoveredStack[]) => Promise<void>;
}): Promise<{ reconciled: ReconcileCounts; total: number }> {
  const repoDir = getRepoDir(options.repoId);
  const { value } = await runLoggedAction<{
    reconciled: ReconcileCounts;
    total: number;
  }>({
    title: options.title,
    action: options.action,
    identity: { kind: "none" },
    failureMessage: options.failureMessage,
    run: async (onOutput) => {
      onOutput(options.progressStart);
      await ensureRemoteTree(
        repoDir,
        options.remote,
        onOutput,
        options.ensure === "clone"
      );
      onOutput(options.progressDone);

      const discoveredStacks = await discoverStacks(
        repoDir,
        options.stacksPath
      );
      // Serialized per repo: the Docker-aware removable probe and the
      // reconcile transaction commit under one lock, so no other holder of
      // the same repo lock (delete, stack deploy/stop — see `repo-lock.ts`)
      // can interleave a status flip, a teardown, or a row delete between
      // the probe and the commit. (Out-of-band daemon changes remain
      // best-effort — fail-closed probe still applies there.)
      const applied = await withRepoLock(options.repoId, async () => {
        await options.preReconcile?.(discoveredStacks);
        // Reconcile and the repo-row write commit together: stacks can never
        // change while the row (insert on register, `lastSyncedAt` on sync)
        // stays stale — and a failed register leaves no ghost repo.
        return db.transaction((tx) => {
          options.applyRepoRow(tx);
          const { reconciled, summary } = reconcileAndSummarizeTx(
            tx,
            options.repoId,
            discoveredStacks,
            onOutput
          );
          return {
            summary,
            result: { reconciled, total: discoveredStacks.length },
          };
        });
      });
      return { output: applied.summary, value: applied.result };
    },
  });
  return value;
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
    const { total } = await materializeRepository({
      repoId,
      title: `Cloning ${input.name}`,
      action: "clone",
      failureMessage: `Failed to clone repository ${input.name}`,
      ensure: "clone",
      progressStart: `Cloning ${input.url} (branch: ${input.branch})...\n`,
      progressDone: "Clone complete. Discovering stacks...\n",
      stacksPath: input.stacksPath,
      remote,
      applyRepoRow: (tx) => {
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

    return { discovered: total };
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

  const { reconciled: counts } = await materializeRepository({
    repoId: repo.id,
    title: `Syncing ${repo.name}`,
    action: "sync",
    failureMessage: `Failed to sync repository ${repo.name}`,
    ensure: "pull",
    progressStart: `Pulling latest changes from ${repo.url}...\n`,
    progressDone: "Pull complete. Discovering stacks...\n",
    stacksPath: repo.stacksPath,
    remote: repo,
    // Sync-only: refuse to reconcile away a stack that is still deployed
    // *or* still has running containers (covers a stale status column).
    // Runs before the tx because the sync transaction cannot await a Docker
    // probe. This pre-check is the only removal gate by design (there is no
    // status-only twin inside `reconcileStacksTx`): it runs under the same
    // per-repo lock every other presence writer holds, so the probe→commit
    // window is closed in-process. Independent probes run in parallel under
    // the same fail-closed rule.
    preReconcile: async (discoveredStacks) => {
      const names = new Set(discoveredStacks.map((s) => s.name));
      const existing = await db
        .select()
        .from(stacks)
        .where(eq(stacks.repositoryId, repo.id));
      await Promise.all(
        existing
          .filter((stack) => !names.has(stack.name))
          .map((stack) => assertStackRemovable(stack))
      );
    },
    applyRepoRow: (tx) => {
      tx.update(repositories)
        .set({ lastSyncedAt: new Date(), updatedAt: new Date() })
        .where(eq(repositories.id, repo.id))
        .run();
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
  // (and lies on partial failure). Runs under the per-repo lock (see
  // `repo-lock.ts`) so a sync probe→commit window cannot interleave the
  // teardown or the row delete.
  const { value } = await withRepoLock(id, () =>
    runLoggedAction<{ warnings: string[] }>({
      title: `Deleting repository ${repo.name}`,
      action: "delete",
      identity: { kind: "none" },
      failureMessage: `Failed to delete repository ${repo.name}`,
      run: async (onOutput) => {
        for (const stack of repoStacks) {
          onOutput(`Bringing down ${stack.name}...\n`);
          try {
            await downProject({
              projectName: stack.name,
              composePath: getComposePath(
                stack.repositoryId,
                stack.relativePath,
                stack.composeFile
              ),
              onOutput,
            });
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
          `Deleted repository ${repo.name} (${repoStacks.length} stack(s) down)\n` +
          warnings.map((w) => `${w}\n`).join("");
        return { output, value: { warnings } };
      },
    })
  );

  return { success: true, warnings: value.warnings };
}
