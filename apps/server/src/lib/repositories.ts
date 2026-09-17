import { randomUUID } from "crypto";
import { existsSync, rmSync } from "fs";
import { db, repositories, stacks } from "@laber/db";
import { eq } from "drizzle-orm";
import {
  cloneRepo,
  pullRepo,
  discoverStacks,
  reconcileStacksTx,
  type DiscoveredStack,
  type StackTx,
} from "./git";
import { getRepoDir, getComposePath } from "./config";
import { runComposeCommand } from "./docker";
import { runLoggedAction, ensureActionSuccess } from "./logged-action";
import { NotFoundError } from "./errors";

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
 * pull). Returns a failure message for *operational* git errors, or null
 * when the tree is ready.
 */
async function ensureRemoteTree(
  repoDir: string,
  remote: RemoteTree,
  onOutput: (chunk: string) => void,
  fresh: boolean
): Promise<string | null> {
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
    return null;
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    onOutput(`Sync failed: ${message}\n`);
    return message;
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
  applyDiscovery: (
    tx: StackTx,
    discovered: DiscoveredStack[],
    onOutput: (chunk: string) => void
  ) => { summary: string; result: T };
}): Promise<T> {
  let captured!: T;

  const result = await runLoggedAction({
    title: options.title,
    action: options.action,
    run: async (onOutput) => {
      onOutput(
        options.fresh
          ? `Cloning ${options.remote.url} (branch: ${options.remote.branch})...\n`
          : `Pulling latest changes from ${options.remote.url}...\n`
      );
      const failure = await ensureRemoteTree(
        options.repoDir,
        options.remote,
        onOutput,
        options.fresh
      );
      if (failure !== null) {
        if (options.fresh) {
          rmSync(options.repoDir, { recursive: true, force: true });
        }
        return { success: false, output: failure };
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
      let summary = "";
      db.transaction((tx) => {
        const applied = options.applyDiscovery(tx, discovered, onOutput);
        captured = applied.result;
        summary = applied.summary;
      });
      return { success: true, output: summary };
    },
  });

  ensureActionSuccess(result, options.failureMessage);

  return captured;
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

  const warnings: string[] = [];
  for (const stack of repoStacks) {
    try {
      await runComposeCommand(
        getComposePath(repo.id, stack.relativePath, stack.composeFile),
        ["down"],
        stack.name
      );
    } catch (e) {
      // A stack that is already down (or Docker being unavailable) must not
      // block teardown; record it so the response says what was skipped.
      warnings.push(
        `Could not bring down stack ${stack.name}: ${e instanceof Error ? e.message : "unknown error"}`
      );
    }
  }

  db.transaction((tx) => {
    tx.delete(stacks).where(eq(stacks.repositoryId, id)).run();
    tx.delete(repositories).where(eq(repositories.id, id)).run();
  });

  try {
    rmSync(getRepoDir(id), { recursive: true, force: true });
  } catch {
    // Disk cleanup is best-effort once the DB rows are gone
  }

  return { success: true, warnings };
}
