import * as v from "valibot";
import { error } from "@sveltejs/kit";
import { query, command } from "$app/server";
import {
  db,
  stacks,
  stackEnvVars,
  stackSecrets,
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
  extractAllEnvVarNames,
  extractSecrets,
  readComposeRaw,
  type SecretDefinition,
} from "$lib/server/compose-parser";
import {
  getStackAndRepo,
  getComposePath,
  getRepoDir,
} from "$lib/server/config";
import {
  createActivity,
  appendOutput,
  finishActivity,
} from "$lib/server/activity";

export const getStackDetail = query(v.string(), async (name) => {
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

  const secrets = await db
    .select()
    .from(stackSecrets)
    .where(eq(stackSecrets.stackId, stack.id));

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
  let detectedEnvVars: string[] = [];
  let detectedSecrets: SecretDefinition[] = [];
  let composeRaw = "";
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
      detectedEnvVars = extractAllEnvVarNames(compose);
      detectedSecrets = extractSecrets(compose);
      composeRaw = readComposeRaw(composePath);
    }
  } catch {
    // Compose file not available
  }

  const secretsByName = new Map(secrets.map((s) => [s.name, s]));

  return {
    stack,
    envVars: envVars.map((ev) => ({
      ...ev,
      value: ev.isSecret ? "••••••••" : ev.value,
    })),
    secrets: detectedSecrets.map((ds) => ({
      name: ds.name,
      filePath: ds.filePath,
      services: ds.services,
      hasValue: (secretsByName.get(ds.name)?.value ?? "") !== "",
    })),
    logs,
    containers,
    services,
    detectedEnvVars,
    composeRaw,
  };
});

export const deployStackCmd = command(v.string(), async (name) => {
  const lookup = await getStackAndRepo(name);
  const { stack, composePath } = lookup;
  const activity = createActivity(`Deploying ${name}`);

  const envVars = await db
    .select()
    .from(stackEnvVars)
    .where(eq(stackEnvVars.stackId, stack.id));

  const envMap: Record<string, string> = {};
  for (const ev of envVars) envMap[ev.key] = ev.value;

  let secretFiles: { filePath: string; value: string }[] = [];
  try {
    const compose = parseComposeFile(composePath);
    const defs = extractSecrets(compose);
    if (defs.length > 0) {
      const dbSecrets = await db
        .select()
        .from(stackSecrets)
        .where(eq(stackSecrets.stackId, stack.id));
      const secretMap = new Map(dbSecrets.map((s) => [s.name, s.value]));
      secretFiles = defs
        .filter((d) => secretMap.has(d.name) && secretMap.get(d.name) !== "")
        .map((d) => ({ filePath: d.filePath, value: secretMap.get(d.name)! }));
    }
  } catch {
    // Compose parsing failed, skip secrets
  }

  const result = await deployStack({
    composePath,
    envVars: envMap,
    secretFiles,
    networkName: stack.networkName ?? undefined,
    projectName: stack.name,
    onOutput: (chunk) => appendOutput(activity.id, chunk),
  });

  finishActivity(activity.id, result.success ? "success" : "error");

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
  const lookup = await getStackAndRepo(name);
  const { stack, composePath } = lookup;
  const activity = createActivity(`Stopping ${name}`);

  const result = await stopStack(
    composePath,
    stack.name,
    (chunk) => appendOutput(activity.id, chunk),
  );

  finishActivity(activity.id, result.success ? "success" : "error");

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
  const lookup = await getStackAndRepo(name);
  const { stack, composePath } = lookup;
  const activity = createActivity(`Restarting ${name}`);

  const result = await restartStack(
    composePath,
    stack.name,
    (chunk) => appendOutput(activity.id, chunk),
  );

  finishActivity(activity.id, result.success ? "success" : "error");

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
  const lookup = await getStackAndRepo(name);
  const { stack, composePath } = lookup;
  const activity = createActivity(`Pulling images for ${name}`);

  const result = await pullStack(
    composePath,
    stack.name,
    (chunk) => appendOutput(activity.id, chunk),
  );

  finishActivity(activity.id, result.success ? "success" : "error");

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
    const lookup = await getStackAndRepo(name);
    const { stack } = lookup;

    const existing = await db
      .select()
      .from(stackEnvVars)
      .where(eq(stackEnvVars.stackId, stack.id));
    const existingByKey = new Map(existing.map((e) => [e.key, e.value]));

    await db.delete(stackEnvVars).where(eq(stackEnvVars.stackId, stack.id));

    if (entries.length > 0) {
      await db.insert(stackEnvVars).values(
        entries.map((e) => ({
          stackId: stack.id,
          key: e.key,
          value:
            e.isSecret && e.value === "••••••••"
              ? (existingByKey.get(e.key) ?? e.value)
              : e.value,
          isSecret: e.isSecret,
        })),
      );
    }

    getStackDetail(name).refresh();
  },
);

export const saveStackSecrets = command(
  v.object({
    name: v.string(),
    entries: v.array(
      v.object({
        name: v.string(),
        value: v.string(),
      }),
    ),
  }),
  async ({ name, entries }) => {
    const lookup = await getStackAndRepo(name);
    const { stack } = lookup;

    const existing = await db
      .select()
      .from(stackSecrets)
      .where(eq(stackSecrets.stackId, stack.id));
    const existingByName = new Map(existing.map((s) => [s.name, s.value]));

    await db.delete(stackSecrets).where(eq(stackSecrets.stackId, stack.id));

    if (entries.length > 0) {
      await db.insert(stackSecrets).values(
        entries.map((e) => ({
          stackId: stack.id,
          name: e.name,
          value:
            e.value === "••••••••"
              ? (existingByName.get(e.name) ?? e.value)
              : e.value,
        })),
      );
    }

    getStackDetail(name).refresh();
  },
);
