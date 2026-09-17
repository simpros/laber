import { randomUUID } from "crypto";
import { existsSync, rmSync } from "fs";
import { db, repositories, stacks } from "@laber/db";
import { eq } from "drizzle-orm";
import {
  cloneRepo,
  pullRepo,
  discoverStacks,
  reconcileDiscoveredStacks,
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
 * Shared reconcile → summarize step. Reconcile failures propagate (a
 * deliberate `ConflictError` must not be flattened into a 500);
 * `runLoggedAction` finishes the activity on throw.
 */
async function reconcileAndSummarize(
  repoId: string,
  discovered: Awaited<ReturnType<typeof discoverStacks>>,
  onOutput: (chunk: string) => void
) {
  const reconciled = await reconcileDiscoveredStacks(repoId, discovered);
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

export async function cloneAndRegisterRepo(input: AddRepositoryInput) {
  // Clone first with a pre-generated id; the DB row is only inserted
  // after the clone succeeds, so a failed clone leaves no ghost repo.
  const repoId = randomUUID();
  const repoDir = getRepoDir(repoId);
  let discoveredCount = 0;

  const result = await runLoggedAction({
    title: `Cloning ${input.name}`,
    action: "clone",
    run: async (onOutput) => {
      onOutput(`Cloning ${input.url} (branch: ${input.branch})...\n`);
      const failure = await ensureRemoteTree(
        repoDir,
        {
          url: input.url,
          branch: input.branch,
          sshPrivateKey: input.sshPrivateKey,
        },
        onOutput,
        true
      );
      if (failure !== null) {
        rmSync(repoDir, { recursive: true, force: true });
        return { success: false, output: failure };
      }
      onOutput("Clone complete. Discovering stacks...\n");

      const discovered = await discoverStacks(repoDir, input.stacksPath);
      const [repo] = await db
        .insert(repositories)
        .values({
          id: repoId,
          name: input.name,
          url: input.url,
          branch: input.branch,
          stacksPath: input.stacksPath,
          sshPrivateKey: input.sshPrivateKey,
          lastSyncedAt: new Date(),
        })
        .returning();
      const { summary } = await reconcileAndSummarize(
        repo.id,
        discovered,
        onOutput
      );
      discoveredCount = discovered.length;
      return { success: true, output: summary };
    },
  });

  ensureActionSuccess(result, `Failed to clone repository ${input.name}`);

  return { discovered: discoveredCount };
}

export async function syncRepository(id: string) {
  const [repo] = await db
    .select()
    .from(repositories)
    .where(eq(repositories.id, id))
    .limit(1);
  if (!repo) throw new NotFoundError("Repository not found");

  let counts = { added: 0, updated: 0, removed: [] as string[] };

  const result = await runLoggedAction({
    title: `Syncing ${repo.name}`,
    action: "sync",
    run: async (onOutput) => {
      onOutput(`Pulling latest changes from ${repo.url}...\n`);

      const failure = await ensureRemoteTree(
        getRepoDir(repo.id),
        repo,
        onOutput,
        false
      );
      if (failure !== null) {
        return { success: false, output: failure };
      }
      onOutput("Pull complete. Discovering stacks...\n");

      const discovered = await discoverStacks(
        getRepoDir(repo.id),
        repo.stacksPath
      );
      const { reconciled, summary } = await reconcileAndSummarize(
        repo.id,
        discovered,
        onOutput
      );
      await db
        .update(repositories)
        .set({ lastSyncedAt: new Date(), updatedAt: new Date() })
        .where(eq(repositories.id, repo.id));
      counts = reconciled;
      return { success: true, output: summary };
    },
  });

  ensureActionSuccess(result, `Failed to sync repository ${repo.name}`);

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
