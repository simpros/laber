import { dirname } from "path";
import { mkdirSync, writeFileSync } from "fs";
import { relative } from "path";
import {
  db,
  stacks,
  stackEnvVars,
  stackSecrets,
  repositories,
  deploymentLogs,
  type Db,
} from "@laber/db";
import { eq, desc } from "drizzle-orm";
import { listContainers, runComposeCommand } from "./docker";
import { deployStack } from "./stack-manager";
import {
  readComposeFile,
  extractServices,
  extractAllEnvVarNames,
  extractNetworkName,
  extractSecrets,
  parseComposeContent,
} from "./compose-parser";
import { getStackAndRepo, getRepoDir, getComposePath } from "./config";
import { runLoggedAction, ensureActionSuccess } from "./logged-action";
import { ValidationError, NotFoundError } from "./errors";
import type { ContainerInfo } from "./types";

function requireName(name: string): string {
  if (!name) throw new ValidationError("Stack name must not be empty");
  return name;
}

export async function getStackDetail(name: string) {
  requireName(name);
  const [stack] = await db
    .select()
    .from(stacks)
    .where(eq(stacks.name, name))
    .limit(1);
  if (!stack) throw new NotFoundError("Stack not found");

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

  let containers: ContainerInfo[] = [];
  try {
    containers = await listContainers(stack.name);
  } catch {
    // Docker not available
  }

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

  return ensureActionSuccess(result, `Deploying ${name} failed`);
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

  const result = await runLoggedAction({
    title: options.title,
    action: options.action,
    stackId: stack.id,
    statusOnSuccess: options.statusOnSuccess,
    run: (onOutput) =>
      runComposeCommand(composePath, options.command, stack.name, onOutput),
  });

  return ensureActionSuccess(result, `${options.title} failed`);
}

export async function saveComposeContent(name: string, content: string) {
  requireName(name);
  if (!content) {
    throw new ValidationError("Compose content must not be empty");
  }
  // Reuse the single compose-shape gate: syntax errors and a missing
  // `services` section are rejected before anything hits disk.
  parseComposeContent(content);
  const { composePath } = await getStackAndRepo(name);

  mkdirSync(dirname(composePath), { recursive: true });
  writeFileSync(composePath, content, "utf-8");

  return { success: true };
}

/**
 * Shared replace-all for nullable keyed rows (stack env vars, stack secrets):
 * `null` means "leave unchanged" (keep the stored value, default ""),
 * anything else replaces the whole set in one transaction.
 */
export function replaceNullableKeyedRows(
  existingByKey: Map<string, string>,
  entries: Array<{ key: string; value: string | null }>
): Array<{ key: string; value: string }> {
  return entries.map((e) => ({
    key: e.key,
    value: e.value ?? existingByKey.get(e.key) ?? "",
  }));
}

export type EnvEntry = {
  key: string;
  value: string | null;
  isSecret: boolean;
};

export type SecretEntry = {
  name: string;
  value: string | null;
};

/**
 * One transaction shell for the nullable keyed-bag tables (stack env vars,
 * stack secrets): delete-all + insert replaces the whole set. Callers only
 * differ in the row mapping.
 */
type StackTx = Parameters<Parameters<Db["transaction"]>[0]>[0];

function replaceStackRows(
  clear: (tx: StackTx) => void,
  fill: (tx: StackTx) => void
): void {
  db.transaction((tx) => {
    clear(tx);
    fill(tx);
  });
}

export async function replaceStackEnv(name: string, entries: EnvEntry[]) {
  requireName(name);
  const { stack } = await getStackAndRepo(name);

  const existing = await db
    .select()
    .from(stackEnvVars)
    .where(eq(stackEnvVars.stackId, stack.id));
  const existingByKey = new Map(existing.map((e) => [e.key, e.value]));
  const isSecretByKey = new Map(entries.map((e) => [e.key, e.isSecret]));
  const merged = replaceNullableKeyedRows(existingByKey, entries);

  replaceStackRows(
    (tx) => {
      tx.delete(stackEnvVars)
        .where(eq(stackEnvVars.stackId, stack.id))
        .run();
    },
    (tx) => {
      if (merged.length > 0) {
        tx.insert(stackEnvVars)
          .values(
            merged.map((e) => ({
              stackId: stack.id,
              key: e.key,
              value: e.value,
              isSecret: isSecretByKey.get(e.key) ?? false,
            }))
          )
          .run();
      }
    }
  );

  return { success: true };
}

export async function replaceStackSecrets(
  name: string,
  entries: SecretEntry[]
) {
  requireName(name);
  const { stack } = await getStackAndRepo(name);

  const existing = await db
    .select()
    .from(stackSecrets)
    .where(eq(stackSecrets.stackId, stack.id));
  const existingByName = new Map(existing.map((s) => [s.name, s.value]));
  const merged = replaceNullableKeyedRows(
    existingByName,
    entries.map((e) => ({ key: e.name, value: e.value }))
  );

  replaceStackRows(
    (tx) => {
      tx.delete(stackSecrets)
        .where(eq(stackSecrets.stackId, stack.id))
        .run();
    },
    (tx) => {
      if (merged.length > 0) {
        tx.insert(stackSecrets)
          .values(
            merged.map((e) => ({
              stackId: stack.id,
              name: e.key,
              value: e.value,
            }))
          )
          .run();
      }
    }
  );

  return { success: true };
}
