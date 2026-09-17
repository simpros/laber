import { Elysia } from "elysia";
import * as v from "valibot";
import { db, repositories, stacks } from "@laber/db";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { existsSync, rmSync } from "fs";
import {
  cloneRepo,
  pullRepo,
  discoverStacks,
  reconcileDiscoveredStacks,
} from "../lib/git";
import { getRepoDir, getComposePath } from "../lib/config";
import { runComposeCommand } from "../lib/docker";
import { runLoggedAction } from "../lib/logged-action";
import { HttpError } from "../lib/errors";
import { parseBody } from "../lib/validate";

const addRepositoryBodySchema = v.object({
  name: v.pipe(v.string(), v.nonEmpty()),
  url: v.pipe(v.string(), v.nonEmpty()),
  branch: v.optional(v.string(), "main"),
  stacksPath: v.optional(v.string(), "stacks"),
  sshPrivateKey: v.optional(v.nullable(v.string()), null),
});

export const repositoryRoutes = new Elysia()
  .get("/api/repositories", async () => {
    const repos = await db.select().from(repositories);
    const allStacks = await db.select().from(stacks);

    return { repositories: repos, stacks: allStacks };
  })
  .post("/api/repositories", async ({ body, set }) => {
    const { name, url, branch, stacksPath, sshPrivateKey } = parseBody(
      addRepositoryBodySchema,
      body
    );
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

    if (!result.success) throw new HttpError(500, result.output);

    set.status = 201;
    return { discovered: discoveredCount };
  })
  .post("/api/repositories/:id/sync", async ({ params }) => {
    const [repo] = await db
      .select()
      .from(repositories)
      .where(eq(repositories.id, params.id))
      .limit(1);
    if (!repo) throw new HttpError(404, "Repository not found");

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
          reconciled = await reconcileDiscoveredStacks(
            repo.id,
            discovered
          );
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

    if (!result.success) throw new HttpError(500, result.output);

    return {
      newStacks: counts.added,
      updatedStacks: counts.updated,
      removedStacks: counts.removed,
    };
  })
  .delete("/api/repositories/:id", async ({ params }) => {
    const [repo] = await db
      .select()
      .from(repositories)
      .where(eq(repositories.id, params.id))
      .limit(1);
    if (!repo) throw new HttpError(404, "Repository not found");

    const repoStacks = await db
      .select()
      .from(stacks)
      .where(eq(stacks.repositoryId, params.id));

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
      tx.delete(stacks).where(eq(stacks.repositoryId, params.id)).run();
      tx.delete(repositories).where(eq(repositories.id, params.id)).run();
    });

    try {
      rmSync(getRepoDir(params.id), { recursive: true, force: true });
    } catch {
      // Disk cleanup is best-effort once the DB rows are gone
    }

    return { success: true };
  });
