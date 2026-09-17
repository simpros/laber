import * as v from "valibot";
import { error } from "@sveltejs/kit";
import { query, command } from "$app/server";
import { db, repositories, stacks } from "@laber/db";
import { and, eq, inArray } from "drizzle-orm";
import { randomUUID } from "crypto";
import { cloneRepo, pullRepo, discoverStacks } from "$lib/server/git";
import { getRepoDir, getComposePath } from "$lib/server/config";
import { existsSync, rmSync } from "fs";
import { runComposeCommand } from "$lib/server/docker";
import { requireUser } from "$lib/server/auth";
import { runLoggedAction } from "$lib/server/logged-action";

type DiscoveredStack = Awaited<ReturnType<typeof discoverStacks>>[number];

export async function reconcileDiscoveredStacks(
  repoId: string,
  discovered: DiscoveredStack[]
): Promise<{ added: number; updated: number; removed: string[] }> {
  const existing = await db
    .select()
    .from(stacks)
    .where(eq(stacks.repositoryId, repoId));
  const existingByName = new Map(existing.map((s) => [s.name, s]));
  const discoveredByName = new Map(discovered.map((s) => [s.name, s]));

  const added = discovered.filter((s) => !existingByName.has(s.name));
  const changed = discovered.filter((s) => {
    const prev = existingByName.get(s.name);
    return (
      prev &&
      (prev.relativePath !== s.relativePath ||
        prev.composeFile !== s.composeFile ||
        prev.networkName !== s.networkName)
    );
  });
  const removed = existing.filter((s) => !discoveredByName.has(s.name));
  const removedNames = removed.map((s) => s.name);

  // Removal policy: refuse to silently orphan a deployed stack; otherwise
  // delete the stale rows (env/secrets cascade, logs detach) in the same
  // transaction as the adds/updates so sync never leaves zombies behind.
  const deployedRemoved = removed
    .filter((s) => s.status === "deployed")
    .map((s) => s.name);
  if (deployedRemoved.length > 0) {
    error(
      409,
      `Cannot sync: stack(s) no longer in repo but still deployed: ${deployedRemoved.join(", ")}. Stop them before syncing.`
    );
  }

  db.transaction((tx) => {
    if (removedNames.length > 0) {
      tx.delete(stacks).where(
        and(
          eq(stacks.repositoryId, repoId),
          inArray(stacks.name, removedNames)
        )
      );
    }
    if (added.length > 0) {
      tx.insert(stacks).values(
        added.map((s) => ({
          repositoryId: repoId,
          name: s.name,
          relativePath: s.relativePath,
          composeFile: s.composeFile,
          networkName: s.networkName,
        }))
      );
    }
    for (const s of changed) {
      tx.update(stacks)
        .set({
          relativePath: s.relativePath,
          composeFile: s.composeFile,
          networkName: s.networkName,
          updatedAt: new Date(),
        })
        .where(
          and(eq(stacks.repositoryId, repoId), eq(stacks.name, s.name))
        );
    }
  });

  return {
    added: added.length,
    updated: changed.length,
    removed: removedNames,
  };
}

export const getRepositories = query(async () => {
  requireUser();
  const repos = await db.select().from(repositories);
  const allStacks = await db.select().from(stacks);

  return { repositories: repos, stacks: allStacks };
});

export const addRepository = command(
  v.object({
    name: v.pipe(v.string(), v.nonEmpty()),
    url: v.pipe(v.string(), v.nonEmpty()),
    branch: v.optional(v.string(), "main"),
    stacksPath: v.optional(v.string(), "stacks"),
    sshPrivateKey: v.optional(v.nullable(v.string()), null),
  }),
  async ({ name, url, branch, stacksPath, sshPrivateKey }) => {
    requireUser();
    // Clone first with a pre-generated id; the DB row is only inserted
    // after the clone succeeds, so a failed clone leaves no ghost repo.
    const repoId = randomUUID();
    const repoDir = getRepoDir(repoId);
    let discoveredCount = 0;

    const result = await runLoggedAction({
      title: `Cloning ${name}`,
      action: "clone",
      run: async (onOutput) => {
        onOutput(`Cloning ${url} (branch: ${branch})...\n`);
        try {
          await cloneRepo(
            url,
            repoDir,
            branch,
            sshPrivateKey ?? undefined
          );
          onOutput("Clone complete. Discovering stacks...\n");
        } catch (e) {
          rmSync(repoDir, { recursive: true, force: true });
          const message = `Failed to clone repository: ${e instanceof Error ? e.message : "Unknown error"}`;
          onOutput(`${message}\n`);
          return { success: false, output: message };
        }

        const discovered = await discoverStacks(repoDir, stacksPath);
        const [repo] = await db
          .insert(repositories)
          .values({
            id: repoId,
            name,
            url,
            branch,
            stacksPath,
            sshPrivateKey,
            lastSyncedAt: new Date(),
          })
          .returning();
        const { added, updated, removed } =
          await reconcileDiscoveredStacks(repo.id, discovered);
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

    if (!result.success) error(500, result.output);

    getRepositories().refresh();
    return { discovered: discoveredCount };
  }
);

export const syncRepository = command(v.string(), async (repoId) => {
  requireUser();
  const [repo] = await db
    .select()
    .from(repositories)
    .where(eq(repositories.id, repoId))
    .limit(1);
  if (!repo) error(404, "Repository not found");

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

  if (!result.success) error(500, result.output);

  getRepositories().refresh();
  return {
    newStacks: counts.added,
    updatedStacks: counts.updated,
    removedStacks: counts.removed,
  };
});

export const removeRepository = command(v.string(), async (repoId) => {
  requireUser();
  const [repo] = await db
    .select()
    .from(repositories)
    .where(eq(repositories.id, repoId))
    .limit(1);
  if (!repo) error(404, "Repository not found");

  const repoStacks = await db
    .select()
    .from(stacks)
    .where(eq(stacks.repositoryId, repoId));

  for (const stack of repoStacks) {
    try {
      await runComposeCommand(
        getComposePath(repo.id, stack.relativePath, stack.composeFile),
        ["down"],
        stack.name
      );
    } catch {
      // Stack may already be down or Docker unavailable; continue teardown
    }
  }

  db.transaction((tx) => {
    tx.delete(stacks).where(eq(stacks.repositoryId, repoId));
    tx.delete(repositories).where(eq(repositories.id, repoId));
  });

  try {
    rmSync(getRepoDir(repoId), { recursive: true, force: true });
  } catch {
    // Disk cleanup is best-effort once the DB rows are gone
  }

  getRepositories().refresh();
});
