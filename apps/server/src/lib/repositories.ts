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
      try {
        await cloneRepo(
          input.url,
          repoDir,
          input.branch,
          input.sshPrivateKey ?? undefined
        );
        onOutput("Clone complete. Discovering stacks...\n");
      } catch (e) {
        rmSync(repoDir, { recursive: true, force: true });
        const message = `Failed to clone repository: ${e instanceof Error ? e.message : "Unknown error"}`;
        onOutput(`${message}\n`);
        return { success: false, output: message };
      }

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
      const { added, updated, removed } = await reconcileDiscoveredStacks(
        repo.id,
        discovered
      );
      discoveredCount = discovered.length;
      const summary =
        `Discovered ${discovered.length} stack(s)` +
        ` (${added} new, ${updated} updated` +
        (removed.length > 0
          ? `, ${removed.length} no longer in repo: ${removed.join(", ")}`
          : "") +
        ")\n";
      onOutput(summary);
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

      const repoDir = getRepoDir(repo.id);

      try {
        if (!existsSync(repoDir)) {
          await cloneRepo(
            repo.url,
            repoDir,
            repo.branch,
            repo.sshPrivateKey ?? undefined
          );
        } else {
          await pullRepo(repoDir, repo.sshPrivateKey ?? undefined);
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : "Unknown error";
        onOutput(`Sync failed: ${message}\n`);
        return { success: false, output: message };
      }

      onOutput("Pull complete. Discovering stacks...\n");

      const discovered = await discoverStacks(repoDir, repo.stacksPath);
      let reconciled;
      try {
        reconciled = await reconcileDiscoveredStacks(repo.id, discovered);
      } catch (e) {
        const message = e instanceof Error ? e.message : "Unknown error";
        onOutput(`Sync failed: ${message}\n`);
        return { success: false, output: message };
      }
      await db
        .update(repositories)
        .set({ lastSyncedAt: new Date(), updatedAt: new Date() })
        .where(eq(repositories.id, repo.id));
      counts = reconciled;
      const summary =
        `Found ${reconciled.added} new, ${reconciled.updated} updated stack(s)` +
        (reconciled.removed.length > 0
          ? ` (${reconciled.removed.length} no longer in repo: ${reconciled.removed.join(", ")})`
          : "") +
        "\n";
      onOutput(summary);
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
