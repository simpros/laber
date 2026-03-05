import { error, fail } from "@sveltejs/kit";
import { db } from "$lib/server/db";
import {
  stacks,
  stackEnvVars,
  repositories,
  deploymentLogs,
} from "@laber/db";
import { eq, desc } from "drizzle-orm";
import { getStackContainers } from "$lib/server/stack-manager";
import {
  deployStack,
  stopStack,
  restartStack,
  pullStack,
} from "$lib/server/stack-manager";
import { parseComposeFile, extractServices } from "$lib/server/compose-parser";
import type { PageServerLoad, Actions } from "./$types";
import { resolve } from "path";

export const load: PageServerLoad = async ({ params }) => {
  const [stack] = await db.select().from(stacks).where(eq(stacks.name, params.name)).limit(1);
  if (!stack) throw error(404, "Stack not found");

  const [repo] = await db.select().from(repositories).where(eq(repositories.id, stack.repositoryId)).limit(1);

  const envVars = await db
    .select()
    .from(stackEnvVars)
    .where(eq(stackEnvVars.stackId, stack.id));

  const logs = await db
    .select()
    .from(deploymentLogs)
    .where(eq(deploymentLogs.stackId, stack.id))
    .orderBy(desc(deploymentLogs.createdAt))
    .limit(20);

  let containers: Awaited<ReturnType<typeof getStackContainers>> = [];
  try {
    containers = await getStackContainers(stack.name);
  } catch {
    // Docker not available
  }

  let services: ReturnType<typeof extractServices> = [];
  try {
    const dataDir = process.env.DATA_DIR ?? "./data";
    const repoDir = repo
      ? resolve(dataDir, "repos", repo.id)
      : "";
    if (repoDir) {
      const composePath = resolve(repoDir, stack.relativePath, stack.composeFile);
      const compose = parseComposeFile(composePath);
      services = extractServices(compose);
    }
  } catch {
    // Compose file not available
  }

  return {
    stack,
    envVars: envVars.map((v) => ({
      ...v,
      value: v.isSecret ? "••••••••" : v.value,
    })),
    logs,
    containers,
    services,
  };
};

export const actions: Actions = {
  deploy: async ({ params }) => {
    const [stack] = await db.select().from(stacks).where(eq(stacks.name, params.name)).limit(1);
    if (!stack) return fail(404, { error: "Stack not found" });

    const [repo] = await db.select().from(repositories).where(eq(repositories.id, stack.repositoryId)).limit(1);
    if (!repo) return fail(404, { error: "Repository not found" });

    const envVars = await db
      .select()
      .from(stackEnvVars)
      .where(eq(stackEnvVars.stackId, stack.id));

    const envMap: Record<string, string> = {};
    for (const v of envVars) envMap[v.key] = v.value;

    const dataDir = process.env.DATA_DIR ?? "./data";
    const composePath = resolve(
      dataDir,
      "repos",
      repo.id,
      stack.relativePath,
      stack.composeFile,
    );

    const result = await deployStack({
      composePath,
      envVars: envMap,
      networkName: stack.networkName ?? undefined,
      projectName: stack.name,
    });

    await db.insert(deploymentLogs).values({
      stackId: stack.id,
      action: "deploy",
      status: result.success ? "success" : "error",
      output: result.output,
    });

    if (result.success) {
      await db
        .update(stacks)
        .set({ status: "deployed", updatedAt: new Date() })
        .where(eq(stacks.id, stack.id));
    }

    return { success: result.success, output: result.output };
  },

  stop: async ({ params }) => {
    const [stack] = await db.select().from(stacks).where(eq(stacks.name, params.name)).limit(1);
    if (!stack) return fail(404, { error: "Stack not found" });

    const [repo] = await db.select().from(repositories).where(eq(repositories.id, stack.repositoryId)).limit(1);
    if (!repo) return fail(404, { error: "Repository not found" });

    const dataDir = process.env.DATA_DIR ?? "./data";
    const composePath = resolve(
      dataDir,
      "repos",
      repo.id,
      stack.relativePath,
      stack.composeFile,
    );

    const result = await stopStack(composePath, stack.name);

    await db.insert(deploymentLogs).values({
      stackId: stack.id,
      action: "stop",
      status: result.success ? "success" : "error",
      output: result.output,
    });

    if (result.success) {
      await db
        .update(stacks)
        .set({ status: "stopped", updatedAt: new Date() })
        .where(eq(stacks.id, stack.id));
    }

    return { success: result.success, output: result.output };
  },

  restart: async ({ params }) => {
    const [stack] = await db.select().from(stacks).where(eq(stacks.name, params.name)).limit(1);
    if (!stack) return fail(404, { error: "Stack not found" });

    const [repo] = await db.select().from(repositories).where(eq(repositories.id, stack.repositoryId)).limit(1);
    if (!repo) return fail(404, { error: "Repository not found" });

    const dataDir = process.env.DATA_DIR ?? "./data";
    const composePath = resolve(
      dataDir,
      "repos",
      repo.id,
      stack.relativePath,
      stack.composeFile,
    );

    const result = await restartStack(composePath, stack.name);

    await db.insert(deploymentLogs).values({
      stackId: stack.id,
      action: "restart",
      status: result.success ? "success" : "error",
      output: result.output,
    });

    return { success: result.success, output: result.output };
  },

  pull: async ({ params }) => {
    const [stack] = await db.select().from(stacks).where(eq(stacks.name, params.name)).limit(1);
    if (!stack) return fail(404, { error: "Stack not found" });

    const [repo] = await db.select().from(repositories).where(eq(repositories.id, stack.repositoryId)).limit(1);
    if (!repo) return fail(404, { error: "Repository not found" });

    const dataDir = process.env.DATA_DIR ?? "./data";
    const composePath = resolve(
      dataDir,
      "repos",
      repo.id,
      stack.relativePath,
      stack.composeFile,
    );

    const result = await pullStack(composePath, stack.name);

    await db.insert(deploymentLogs).values({
      stackId: stack.id,
      action: "pull",
      status: result.success ? "success" : "error",
      output: result.output,
    });

    return { success: result.success, output: result.output };
  },

  saveEnv: async ({ params, request }) => {
    const [stack] = await db.select().from(stacks).where(eq(stacks.name, params.name)).limit(1);
    if (!stack) return fail(404, { error: "Stack not found" });

    const formData = await request.formData();
    const envJson = formData.get("env") as string;
    if (!envJson) return fail(400, { error: "No env data" });

    const envEntries: Array<{
      key: string;
      value: string;
      isSecret: boolean;
    }> = JSON.parse(envJson);

    await db
      .delete(stackEnvVars)
      .where(eq(stackEnvVars.stackId, stack.id));

    if (envEntries.length > 0) {
      await db.insert(stackEnvVars).values(
        envEntries.map((e) => ({
          stackId: stack.id,
          key: e.key,
          value: e.value,
          isSecret: e.isSecret,
        })),
      );
    }

    return { success: true };
  },
};
