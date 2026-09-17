import { relative } from "path";
import {
  db,
  stacks,
  stackEnvVars,
  stackSecrets,
  repositories,
  deploymentLogs,
} from "@laber/db";
import { eq, desc, count } from "drizzle-orm";
import { listContainers, runComposeCommand } from "./docker";
import { deployStack } from "./deploy";
import {
  readComposeFile,
  extractServices,
  extractAllEnvVarNames,
  extractNetworkName,
  extractSecrets,
} from "./compose-parser";
import { getStackAndRepo, getRepoDir, getComposePath } from "./config";
import { runLoggedAction } from "./logged-action";
import { ValidationError, NotFoundError } from "./errors";
import type { ContainerInfo } from "./types";

function requireName(name: string): string {
  if (!name) throw new ValidationError("Stack name must not be empty");
  return name;
}

export async function listStacks() {
  const [allStacks, envCounts] = await Promise.all([
    db
      .select({
        id: stacks.id,
        name: stacks.name,
        status: stacks.status,
        relativePath: stacks.relativePath,
        composeFile: stacks.composeFile,
        networkName: stacks.networkName,
        repositoryId: stacks.repositoryId,
        createdAt: stacks.createdAt,
        updatedAt: stacks.updatedAt,
        repoName: repositories.name,
        repoUrl: repositories.url,
      })
      .from(stacks)
      .leftJoin(repositories, eq(stacks.repositoryId, repositories.id)),
    db
      .select({ stackId: stackEnvVars.stackId, count: count() })
      .from(stackEnvVars)
      .groupBy(stackEnvVars.stackId),
  ]);
  const countByStackId = new Map(envCounts.map((r) => [r.stackId, r.count]));

  return allStacks.map((stack) => ({
    ...stack,
    envVarCount: countByStackId.get(stack.id) ?? 0,
  }));
}

export async function getStackDetail(name: string) {
  requireName(name);
  const [stack] = await db
    .select()
    .from(stacks)
    .where(eq(stacks.name, name))
    .limit(1);
  if (!stack) throw new NotFoundError("Stack not found");

  // Independent reads, fetched together: repo row, env, secrets, logs,
  // Docker state. The compose file needs the repo row, so it is parsed
  // after the join (single disk read, sync, with internal fallback).
  const [repoRows, envVars, secrets, logs, containers] = await Promise.all([
    db
      .select()
      .from(repositories)
      .where(eq(repositories.id, stack.repositoryId))
      .limit(1),
    db
      .select()
      .from(stackEnvVars)
      .where(eq(stackEnvVars.stackId, stack.id)),
    db
      .select()
      .from(stackSecrets)
      .where(eq(stackSecrets.stackId, stack.id)),
    db
      .select()
      .from(deploymentLogs)
      .where(eq(deploymentLogs.stackId, stack.id))
      .orderBy(desc(deploymentLogs.createdAt))
      .limit(20),
    // The docker stub throws synchronously (no promise), so the call is
    // wrapped lazily — .catch on a sync throw would never attach.
    Promise.resolve()
      .then(() => listContainers(stack.name))
      .catch((): ContainerInfo[] => []),
  ]);
  const repo = repoRows[0];

  let services: ReturnType<typeof extractServices> = [];
  let detectedEnvVars: string[] = [];
  let detectedSecrets: ReturnType<typeof extractSecrets> = [];
  let composeRaw = "";
  try {
    const repoDir = repo ? getRepoDir(repo.id) : "";
    if (repoDir) {
      // Single disk read: raw text for the editor, parsed doc for detection.
      const composePath = getComposePath(
        repo.id,
        stack.relativePath,
        stack.composeFile
      );
      const { raw, compose } = readComposeFile(composePath);
      composeRaw = raw;
      services = extractServices(compose);
      detectedEnvVars = extractAllEnvVarNames(compose);
      detectedSecrets = extractSecrets(compose, composePath).map((d) => ({
        ...d,
        filePath: relative(getRepoDir(repo.id), d.filePath),
      }));
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
}

export async function deployStackByName(name: string) {
  requireName(name);
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
    compose = readComposeFile(composePath).compose;
  } catch (e) {
    throw new ValidationError(
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
      throw new ValidationError(
        `Cannot deploy: missing values for secret(s): ${missing.join(", ")}`
      );
    }
    secretFiles = defs.map((d) => ({
      filePath: d.filePath,
      value: secretMap.get(d.name)!,
    }));
  }

  const { output } = await runLoggedAction({
    title: `Deploying ${name}`,
    action: "deploy",
    stackId: stack.id,
    statusOnSuccess: "deployed",
    failureMessage: `Deploying ${name} failed`,
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

  return { success: true as const, output };
}

export async function runStackLifecycle(options: {
  name: string;
  title: string;
  action: string;
  command: string[];
  statusOnSuccess?: "deployed" | "stopped" | "error";
}) {
  requireName(options.name);
  const lookup = await getStackAndRepo(options.name);
  const { stack, composePath } = lookup;

  const { output } = await runLoggedAction({
    title: options.title,
    action: options.action,
    stackId: stack.id,
    statusOnSuccess: options.statusOnSuccess,
    failureMessage: `${options.title} failed`,
    run: (onOutput) =>
      runComposeCommand(composePath, options.command, stack.name, onOutput),
  });

  return { success: true as const, output };
}

/** Compose argv lives here, not in the route module. */
export async function stopStack(name: string) {
  return runStackLifecycle({
    name,
    title: `Stopping ${name}`,
    action: "stop",
    command: ["down"],
    statusOnSuccess: "stopped",
  });
}

/** Compose argv lives here, not in the route module. */
export async function restartStack(name: string) {
  return runStackLifecycle({
    name,
    title: `Restarting ${name}`,
    action: "restart",
    command: ["restart"],
  });
}

/** Compose argv lives here, not in the route module. */
export async function pullStack(name: string) {
  return runStackLifecycle({
    name,
    title: `Pulling images for ${name}`,
    action: "pull",
    command: ["pull"],
  });
}
