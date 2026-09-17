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
import { relative } from "path";
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
  extractNetworkName,
  extractSecrets,
  readComposeRaw,
  type SecretDefinition,
} from "$lib/server/compose-parser";
import {
  getStackAndRepo,
  getComposePath,
  getRepoDir,
} from "$lib/server/config";
import { runLoggedAction } from "$lib/server/logged-action";
import { requireUser } from "$lib/server/auth";

export const getStackDetail = query(v.string(), async (name) => {
  requireUser();
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
        stack.composeFile
      );
      const compose = parseComposeFile(composePath);
      services = extractServices(compose);
      detectedEnvVars = extractAllEnvVarNames(compose);
      detectedSecrets = extractSecrets(compose, composePath).map((d) => ({
        ...d,
        filePath: relative(getRepoDir(repo.id), d.filePath),
      }));
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
      value: ev.isSecret ? "" : ev.value,
      hasValue: ev.value !== "",
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
  requireUser();
  const lookup = await getStackAndRepo(name);
  const { stack, composePath } = lookup;

  const envVars = await db
    .select()
    .from(stackEnvVars)
    .where(eq(stackEnvVars.stackId, stack.id));

  const envMap: Record<string, string> = {};
  for (const ev of envVars) envMap[ev.key] = ev.value;

  // Deploy parses the compose file fresh and fails instead of falling back
  // to cached DB values: a broken compose or a missing secret must not
  // produce a secret-less deploy with a stale network name.
  let compose;
  try {
    compose = parseComposeFile(composePath);
  } catch (e) {
    error(
      400,
      `Cannot deploy: failed to parse compose file (${e instanceof Error ? e.message : "unknown error"})`
    );
  }
  const networkName = extractNetworkName(compose);
  const defs = extractSecrets(compose, composePath);
  let secretFiles: { filePath: string; value: string }[] = [];
  if (defs.length > 0) {
    const dbSecrets = await db
      .select()
      .from(stackSecrets)
      .where(eq(stackSecrets.stackId, stack.id));
    const secretMap = new Map(dbSecrets.map((s) => [s.name, s.value]));
    const missing = defs
      .filter((d) => (secretMap.get(d.name) ?? "") === "")
      .map((d) => d.name);
    if (missing.length > 0) {
      error(
        400,
        `Cannot deploy: missing values for secret(s): ${missing.join(", ")}`
      );
    }
    secretFiles = defs.map((d) => ({
      filePath: d.filePath,
      value: secretMap.get(d.name)!,
    }));
  }

  const result = await runLoggedAction({
    title: `Deploying ${name}`,
    action: "deploy",
    stackId: stack.id,
    statusOnSuccess: "deployed",
    run: (onOutput) =>
      deployStack({
        composePath,
        envVars: envMap,
        secretFiles,
        networkName,
        projectName: stack.name,
        onOutput,
      }),
  });

  getStackDetail(name).refresh();
  return { success: result.success, output: result.output };
});

export const stopStackCmd = command(v.string(), async (name) => {
  requireUser();
  const lookup = await getStackAndRepo(name);
  const { stack, composePath } = lookup;

  const result = await runLoggedAction({
    title: `Stopping ${name}`,
    action: "stop",
    stackId: stack.id,
    statusOnSuccess: "stopped",
    run: (onOutput) => stopStack(composePath, stack.name, onOutput),
  });

  getStackDetail(name).refresh();
  return { success: result.success, output: result.output };
});

export const restartStackCmd = command(v.string(), async (name) => {
  requireUser();
  const lookup = await getStackAndRepo(name);
  const { stack, composePath } = lookup;

  const result = await runLoggedAction({
    title: `Restarting ${name}`,
    action: "restart",
    stackId: stack.id,
    run: (onOutput) => restartStack(composePath, stack.name, onOutput),
  });

  getStackDetail(name).refresh();
  return { success: result.success, output: result.output };
});

export const pullStackCmd = command(v.string(), async (name) => {
  requireUser();
  const lookup = await getStackAndRepo(name);
  const { stack, composePath } = lookup;

  const result = await runLoggedAction({
    title: `Pulling images for ${name}`,
    action: "pull",
    stackId: stack.id,
    run: (onOutput) => pullStack(composePath, stack.name, onOutput),
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
        value: v.nullable(v.string()),
        isSecret: v.boolean(),
      })
    ),
  }),
  async ({ name, entries }) => {
    requireUser();
    const lookup = await getStackAndRepo(name);
    const { stack } = lookup;

    const existing = await db
      .select()
      .from(stackEnvVars)
      .where(eq(stackEnvVars.stackId, stack.id));
    const existingByKey = new Map(existing.map((e) => [e.key, e.value]));

    db.transaction((tx) => {
      tx.delete(stackEnvVars).where(eq(stackEnvVars.stackId, stack.id));

      if (entries.length > 0) {
        tx.insert(stackEnvVars).values(
          entries.map((e) => ({
            stackId: stack.id,
            key: e.key,
            value: e.value ?? existingByKey.get(e.key) ?? "",
            isSecret: e.isSecret,
          }))
        );
      }
    });

    getStackDetail(name).refresh();
  }
);

export const saveStackSecrets = command(
  v.object({
    name: v.string(),
    entries: v.array(
      v.object({
        name: v.string(),
        value: v.nullable(v.string()),
      })
    ),
  }),
  async ({ name, entries }) => {
    requireUser();
    const lookup = await getStackAndRepo(name);
    const { stack } = lookup;

    const existing = await db
      .select()
      .from(stackSecrets)
      .where(eq(stackSecrets.stackId, stack.id));
    const existingByName = new Map(existing.map((s) => [s.name, s.value]));

    db.transaction((tx) => {
      tx.delete(stackSecrets).where(eq(stackSecrets.stackId, stack.id));

      if (entries.length > 0) {
        tx.insert(stackSecrets).values(
          entries.map((e) => ({
            stackId: stack.id,
            name: e.name,
            value: e.value ?? existingByName.get(e.name) ?? "",
          }))
        );
      }
    });

    getStackDetail(name).refresh();
  }
);
