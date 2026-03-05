import { fail } from "@sveltejs/kit";
import { db } from "$lib/server/db";
import { repositories, stacks } from "@laber/db";
import { eq } from "drizzle-orm";
import { cloneRepo, pullRepo, discoverStacks } from "$lib/server/git";
import { resolve } from "path";
import { existsSync } from "fs";
import type { PageServerLoad, Actions } from "./$types";

export const load: PageServerLoad = async () => {
  const repos = await db.select().from(repositories);
  const allStacks = await db.select().from(stacks);

  return {
    repositories: repos,
    stacks: allStacks,
  };
};

export const actions: Actions = {
  add: async ({ request }) => {
    const formData = await request.formData();
    const name = formData.get("name") as string;
    const url = formData.get("url") as string;
    const branch = (formData.get("branch") as string) || "main";
    const stacksPath = (formData.get("stacksPath") as string) || "stacks";
    const sshPrivateKey = (formData.get("sshPrivateKey") as string) || null;

    if (!name || !url) return fail(400, { error: "Name and URL are required" });

    const [repo] = await db
      .insert(repositories)
      .values({ name, url, branch, stacksPath, sshPrivateKey })
      .returning();

    const dataDir = process.env.DATA_DIR ?? "./data";
    const repoDir = resolve(dataDir, "repos", repo.id);

    try {
      await cloneRepo(url, repoDir, branch, sshPrivateKey ?? undefined);
      await db
        .update(repositories)
        .set({ lastSyncedAt: new Date() })
        .where(eq(repositories.id, repo.id));
    } catch (e) {
      await db.delete(repositories).where(eq(repositories.id, repo.id));
      return fail(500, {
        error: `Failed to clone repository: ${e instanceof Error ? e.message : "Unknown error"}`,
      });
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

    return { success: true, discovered: discovered.length };
  },

  sync: async ({ request }) => {
    const formData = await request.formData();
    const repoId = formData.get("repoId") as string;
    if (!repoId) return fail(400, { error: "Repository ID required" });

    const [repo] = await db.select().from(repositories).where(eq(repositories.id, repoId)).limit(1);
    if (!repo) return fail(404, { error: "Repository not found" });

    const dataDir = process.env.DATA_DIR ?? "./data";
    const repoDir = resolve(dataDir, "repos", repo.id);

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

    return { success: true, newStacks: newStacks.length };
  },

  remove: async ({ request }) => {
    const formData = await request.formData();
    const repoId = formData.get("repoId") as string;
    if (!repoId) return fail(400, { error: "Repository ID required" });

    await db.delete(stacks).where(eq(stacks.repositoryId, repoId));
    await db.delete(repositories).where(eq(repositories.id, repoId));

    return { success: true };
  },
};
