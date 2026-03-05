import * as v from "valibot";
import { error } from "@sveltejs/kit";
import { query, command } from "$app/server";
import { getDb } from "$lib/server/db";
import { repositories, stacks } from "@laber/db";
import { eq } from "drizzle-orm";
import { cloneRepo, pullRepo, discoverStacks } from "$lib/server/git";
import { getRepoDir } from "$lib/server/config";
import { existsSync } from "fs";

export const getRepositories = query(async () => {
  const db = getDb();
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
    const db = getDb();
    const [repo] = await db
      .insert(repositories)
      .values({ name, url, branch, stacksPath, sshPrivateKey })
      .returning();

    const repoDir = getRepoDir(repo.id);

    try {
      await cloneRepo(url, repoDir, branch, sshPrivateKey ?? undefined);
      await db
        .update(repositories)
        .set({ lastSyncedAt: new Date() })
        .where(eq(repositories.id, repo.id));
    } catch (e) {
      await db.delete(repositories).where(eq(repositories.id, repo.id));
      error(
        500,
        `Failed to clone repository: ${e instanceof Error ? e.message : "Unknown error"}`,
      );
    }

    const discovered = await discoverStacks(repoDir, stacksPath);
    if (discovered.length > 0) {
      await db.insert(stacks).values(
        discovered.map((s) => ({
          repositoryId: repo.id,
          name: s.name,
          relativePath: s.relativePath,
          composeFile: s.composeFile,
          networkName: s.networkName,
        })),
      );
    }

    getRepositories().refresh();
    return { discovered: discovered.length };
  },
);

export const syncRepository = command(
  v.string(),
  async (repoId) => {
    const db = getDb();
    const [repo] = await db
      .select()
      .from(repositories)
      .where(eq(repositories.id, repoId))
      .limit(1);
    if (!repo) error(404, "Repository not found");

    const repoDir = getRepoDir(repo.id);

    if (!existsSync(repoDir)) {
      await cloneRepo(
        repo.url,
        repoDir,
        repo.branch,
        repo.sshPrivateKey ?? undefined,
      );
    } else {
      await pullRepo(repoDir, repo.sshPrivateKey ?? undefined);
    }

    await db
      .update(repositories)
      .set({ lastSyncedAt: new Date(), updatedAt: new Date() })
      .where(eq(repositories.id, repo.id));

    const discovered = await discoverStacks(repoDir, repo.stacksPath);
    const existingStacks = await db
      .select()
      .from(stacks)
      .where(eq(stacks.repositoryId, repoId));
    const existingNames = new Set(existingStacks.map((s) => s.name));

    const newStacks = discovered.filter((s) => !existingNames.has(s.name));
    if (newStacks.length > 0) {
      await db.insert(stacks).values(
        newStacks.map((s) => ({
          repositoryId: repoId,
          name: s.name,
          relativePath: s.relativePath,
          composeFile: s.composeFile,
          networkName: s.networkName,
        })),
      );
    }

    getRepositories().refresh();
    return { newStacks: newStacks.length };
  },
);

export const removeRepository = command(
  v.string(),
  async (repoId) => {
    const db = getDb();
    await db.delete(stacks).where(eq(stacks.repositoryId, repoId));
    await db.delete(repositories).where(eq(repositories.id, repoId));

    getRepositories().refresh();
  },
);
