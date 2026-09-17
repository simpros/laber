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
import { listContainersSoft } from "./docker-engine";
import { runLoggedAction } from "./logged-action";
import { deployStack } from "./deploy";
import {
  loadComposeDocument,
  extractServices,
  extractAllEnvVarNames,
  extractNetworkName,
} from "./compose-document";
import { getStackAndRepo, getRepoDir, assertStackName } from "./config";
import { ValidationError } from "./errors";

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

/**
 * Compose read for detail: missing file → empty defaults (nothing to show);
 * present-but-invalid → loud `ValidationError`, the same gate deploy
 * enforces, so the UI looks broken instead of empty.
 */
function loadComposeForDetail(composePath: string, repoId: string) {
  if (!existsSync(composePath)) {
    return {
      raw: "",
      services: [] as ReturnType<typeof extractServices>,
      detectedEnvVars: [] as string[],
      detectedSecrets: [] as ReturnType<typeof loadComposeDocument>["secrets"],
    };
  }
  // Single disk read through the one compose gate (envelope + secret
  // refs): a present-but-invalid file throws `ValidationError`, the same
  // gate deploy and save enforce, so the UI looks broken instead of empty.
  const { raw, doc, secrets: detectedSecrets } = loadComposeDocument(composePath);
  return {
    raw,
    services: extractServices(doc),
    detectedEnvVars: extractAllEnvVarNames(doc),
    detectedSecrets: detectedSecrets.map((d) => ({
      ...d,
      filePath: relative(getRepoDir(repoId), d.filePath),
    })),
  };
}

export async function getStackDetail(name: string) {
  // One context loader for reads and mutations: a stack whose repo row is
  // gone is corrupt, not "empty" — detail 404s like deploy/stop do.
  const { stack, repo, composePath } = await getStackAndRepo(name);

  // Independent reads, fetched together: env, secrets, logs, Docker state.
  // Container state is the soft contract: an unreadable daemon reads as
  // "unknown" (empty), never a 500 on a read path.
  const [envVars, secrets, logs, containers] = await Promise.all([
    db
      .select()
      .from(stackEnvVars)
      .where(eq(stackEnvVars.stackId, stack.id)),
    db.select().from(stackSecrets).where(eq(stackSecrets.stackId, stack.id)),
    db
      .select()
      .from(deploymentLogs)
      .where(eq(deploymentLogs.stackId, stack.id))
      .orderBy(desc(deploymentLogs.createdAt))
      .limit(20),
    listContainersSoft(stack.name),
  ]);

  const {
    raw: composeRaw,
    services,
    detectedEnvVars,
    detectedSecrets,
  } = loadComposeForDetail(composePath, repo.id);

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
  const { stack, composePath } = await getStackAndRepo(name);

  const envVars = await db
    .select()
    .from(stackEnvVars)
    .where(eq(stackEnvVars.stackId, stack.id));

  const envMap: Record<string, string> = {};
  for (const ev of envVars) envMap[ev.key] = ev.value;

  // Deploy reads through the one compose gate detail and save use: a
  // broken compose or a missing secret fails instead of falling back
  // to cached DB values, so a bad file must not produce a secret-less deploy
  // with a stale network name. Only the error phrasing is deploy-specific.
  let doc: ReturnType<typeof loadComposeDocument>["doc"];
  let defs: ReturnType<typeof loadComposeDocument>["secrets"];
  try {
    ({ doc, secrets: defs } = loadComposeDocument(composePath));
  } catch (e) {
    if (e instanceof ValidationError) {
      throw new ValidationError(
        `Cannot deploy: failed to parse compose file (${e.message})`
      );
    }
    throw new ValidationError("Cannot deploy: compose file is missing");
  }
  const networkName = extractNetworkName(doc);
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

  // Deploy's `deployed`/`error` status commit is UI/history, not a removable
  // input: the sync/delete lock owns only the Docker-aware probe→reconcile
  // and teardown→delete windows, so deploy runs unlocked.
  return runLoggedAction({
    title: `Deploying ${name}`,
    action: "deploy",
    identity: { kind: "stack", stackId: stack.id, statusOnSuccess: "deployed" },
    failureMessage: `Deploying ${name} failed`,
    run: async (onOutput) => {
      const result = await deployStack({
        composePath,
        envVars: envMap,
        secretFiles,
        networkName,
        projectName: stack.name,
        onOutput,
      });
      return { output: result.output };
    },
  });
}
