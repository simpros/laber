import * as v from "valibot";
import { error } from "@sveltejs/kit";
import { query, command } from "$app/server";
import { getDb } from "$lib/server/db";
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
import {
  parseComposeFile,
  extractServices,
} from "$lib/server/compose-parser";
import {
  getStackAndRepo,
  getComposePath,
  getRepoDir,
} from "$lib/server/config";

export const getStackDetail = query(v.string(), async (name) => {
  const db = getDb();
  const [stack] = await db
    .select()
    .from(stacks)
    .where(eq(stacks.name, name))
    .limit(1);
  if (!stack) error(404, "Stack not found");

  const [repo] = await db
    .select()
    .from(repositories)
    .where(eq(repositories.id, stack.repositoryId))
    .limit(1);

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
    const repoDir = repo ? getRepoDir(repo.id) : "";
    if (repoDir) {
      const composePath = getComposePath(
        repo.id,
        stack.relativePath,
        stack.composeFile,
      );
      const compose = parseComposeFile(composePath);
      services = extractServices(compose);
    }
  } catch {
    // Compose file not available
  }

  return {
    stack,
    envVars: envVars.map((ev) => ({
      ...ev,
      value: ev.isSecret ? "••••••••" : ev.value,
    })),
    logs,
    containers,
    services,
  };
});

export const deployStackCmd = command(v.string(), async (name) => {
  const db = getDb();
  const lookup = await getStackAndRepo(name);
  const { stack, composePath } = lookup;

  const envVars = await db
    .select()
    .from(stackEnvVars)
    .where(eq(stackEnvVars.stackId, stack.id));

  const envMap: Record<string, string> = {};
  for (const ev of envVars) envMap[ev.key] = ev.value;

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

  getStackDetail(name).refresh();
  return { success: result.success, output: result.output };
});

export const stopStackCmd = command(v.string(), async (name) => {
  const db = getDb();
  const lookup = await getStackAndRepo(name);
  const { stack, composePath } = lookup;

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

  getStackDetail(name).refresh();
  return { success: result.success, output: result.output };
});

export const restartStackCmd = command(v.string(), async (name) => {
  const db = getDb();
  const lookup = await getStackAndRepo(name);
  const { stack, composePath } = lookup;

  const result = await restartStack(composePath, stack.name);

  await db.insert(deploymentLogs).values({
    stackId: stack.id,
    action: "restart",
    status: result.success ? "success" : "error",
    output: result.output,
  });

  getStackDetail(name).refresh();
  return { success: result.success, output: result.output };
});

export const pullStackCmd = command(v.string(), async (name) => {
  const db = getDb();
  const lookup = await getStackAndRepo(name);
  const { stack, composePath } = lookup;

  const result = await pullStack(composePath, stack.name);

  await db.insert(deploymentLogs).values({
    stackId: stack.id,
    action: "pull",
    status: result.success ? "success" : "error",
    output: result.output,
  });

  getStackDetail(name).refresh();
  return { success: result.success, output: result.output };
});

export const saveStackEnv = command(
  v.object({
    name: v.string(),
    entries: v.array(
      v.object({
        key: v.string(),
        value: v.string(),
        isSecret: v.boolean(),
      }),
    ),
  }),
  async ({ name, entries }) => {
    const db = getDb();
    const lookup = await getStackAndRepo(name);
    const { stack } = lookup;

    await db.delete(stackEnvVars).where(eq(stackEnvVars.stackId, stack.id));

    if (entries.length > 0) {
      await db.insert(stackEnvVars).values(
        entries.map((e) => ({
          stackId: stack.id,
          key: e.key,
          value: e.value,
          isSecret: e.isSecret,
        })),
      );
    }

    getStackDetail(name).refresh();
  },
);
