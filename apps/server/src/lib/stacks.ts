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
import { loadCompose } from "./compose-parse";
import {
  extractServices,
  extractAllEnvVarNames,
} from "./compose-services";
import { getStackAndRepo } from "./stack-context";
import { getRepoDir } from "./config";

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

function loadComposeForDetail(composePath: string, repoId: string) {
  const loaded = loadCompose(composePath, { missing: "empty" });
  if (!loaded.doc) {
    return {
      raw: "",
      services: [] as ReturnType<typeof extractServices>,
      detectedEnvVars: [] as string[],
      detectedSecrets: [] as typeof loaded.secrets,
    };
  }
  const { raw, doc, secrets: detectedSecrets } = loaded;
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
  const { stack, repo, composePath } = await getStackAndRepo(name);

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
