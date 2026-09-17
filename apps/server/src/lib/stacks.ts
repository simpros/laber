import { existsSync } from "fs";
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
import { listContainers } from "./docker";
import { runStackOp, loggedDeployAction } from "./compose-actions";
import {
  readComposeFile,
  extractServices,
  extractAllEnvVarNames,
  extractNetworkName,
  extractSecrets,
} from "./compose-document";
import {
  getStackAndRepo,
  getRepoDir,
  getComposePath,
  assertStackName,
} from "./config";
import { ValidationError, NotFoundError } from "./errors";
import type { ContainerInfo } from "./types";

export async function listStacks() {
  const [allStacks, envCounts] = await Promise.all([
    db
      .select({
        id: stacks.id,
        name: stacks.name,
        status: stacks.status,
        relativePath: stacks.relativePath,
        composeFile: stacks.composeFile,
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
  const countByStackId = new Map(
    envCounts.map((r) => [r.stackId, r.count])
  );

  return allStacks.map((stack) => ({
    ...stack,
    envVarCount: countByStackId.get(stack.id) ?? 0,
  }));
}

export async function getStackDetail(name: string) {
  assertStackName(name);
  const [stack] = await db
    .select()
    .from(stacks)
    .where(eq(stacks.name, name))
    .limit(1);
  if (!stack) throw new NotFoundError("Stack not found");

  // Independent reads, fetched together: repo row, env, secrets, logs,
  // Docker state. The compose file needs the repo row, so it is parsed
  // after the join (single disk read, sync, with internal fallback).
  const [repoRows, envVars, secrets, logs, containers] = await Promise.all(
    [
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
    ]
  );
  const repo = repoRows[0];

  let services: ReturnType<typeof extractServices> = [];
  let detectedEnvVars: string[] = [];
  let detectedSecrets: ReturnType<typeof extractSecrets> = [];
  let composeRaw = "";
  if (repo) {
    const repoDir = getRepoDir(repo.id);
    if (repoDir) {
      // Single disk read: raw text for the editor, parsed doc for detection.
      const composePath = getComposePath(
        repo.id,
        stack.relativePath,
        stack.composeFile
      );
      // A missing compose file means "nothing to show" (empty defaults);
      // a present-but-invalid file is a loud ValidationError, the same
      // gate deploy enforces — the UI must look broken, not empty.
      if (existsSync(composePath)) {
        const { raw, doc } = readComposeFile(composePath);
        composeRaw = raw;
        services = extractServices(doc);
        detectedEnvVars = extractAllEnvVarNames(doc);
        detectedSecrets = extractSecrets(doc, composePath).map((d) => ({
          ...d,
          filePath: relative(getRepoDir(repo.id), d.filePath),
        }));
      }
    }
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
  assertStackName(name);
  const lookup = await getStackAndRepo(name);
  const { stack, composePath } = lookup;

  const envVars = await db
    .select()
    .from(stackEnvVars)
    .where(eq(stackEnvVars.stackId, stack.id));

  const envMap: Record<string, string> = {};
  for (const ev of envVars) envMap[ev.key] = ev.value;

  // Deploy parses through the same `readComposeFile` gate detail and save
  // use: a broken compose or a missing secret fails instead of falling back
  // to cached DB values, so a bad file must not produce a secret-less deploy
  // with a stale network name. Only the error phrasing is deploy-specific.
  let doc: ReturnType<typeof readComposeFile>["doc"];
  try {
    doc = readComposeFile(composePath).doc;
  } catch (e) {
    if (e instanceof ValidationError) {
      throw new ValidationError(
        `Cannot deploy: failed to parse compose file (${e.message})`
      );
    }
    throw new ValidationError("Cannot deploy: compose file is missing");
  }
  const networkName = extractNetworkName(doc);
  const defs = extractSecrets(doc, composePath);
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

  return loggedDeployAction({
    title: `Deploying ${name}`,
    action: "deploy",
    stackId: stack.id,
    statusOnSuccess: "deployed",
    failureMessage: `Deploying ${name} failed`,
    deploy: {
      composePath,
      envVars: envMap,
      secretFiles,
      networkName,
      projectName: stack.name,
    },
  });
}

/** Compose argv lives in `STACK_OPS` (`compose-actions.ts`), not in routes. */
export async function stopStack(name: string) {
  return runStackOp(name, "stop");
}

/** Restart carries `stackId` (log attribution) but no `statusOnSuccess`: it
 * does not change desired runtime, so even a failure must keep the
 * deploy/stop marker that sync gates on. */
export async function restartStack(name: string) {
  return runStackOp(name, "restart");
}

/** Same status contract as restart: pull never touches `stacks.status`. */
export async function pullStack(name: string) {
  return runStackOp(name, "pull");
}
