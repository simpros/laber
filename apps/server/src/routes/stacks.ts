import { Elysia } from "elysia";
import * as v from "valibot";
import { dirname } from "path";
import { mkdirSync, writeFileSync } from "fs";
import { parse } from "yaml";
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
import {
  getStackContainers,
  deployStack,
  stopStack,
  restartStack,
  pullStack,
} from "../lib/stack-manager";
import {
  parseComposeFile,
  extractServices,
  extractAllEnvVarNames,
  extractNetworkName,
  extractSecrets,
  readComposeRaw,
  type SecretDefinition,
} from "../lib/compose-parser";
import {
  getStackAndRepo,
  getComposePath,
  getRepoDir,
} from "../lib/config";
import { runLoggedAction } from "../lib/logged-action";
import { HttpError } from "../lib/errors";
import { parseBody } from "../lib/validate";

const saveEnvBodySchema = v.object({
  entries: v.array(
    v.object({
      key: v.string(),
      value: v.nullable(v.string()),
      isSecret: v.boolean(),
    })
  ),
});

const saveSecretsBodySchema = v.object({
  entries: v.array(
    v.object({
      name: v.string(),
      value: v.nullable(v.string()),
    })
  ),
});

const saveComposeBodySchema = v.object({
  content: v.pipe(
    v.string(),
    v.nonEmpty("Compose content must not be empty")
  ),
});

function requireName(name: string): string {
  if (!name) throw new HttpError(400, "Stack name must not be empty");
  return name;
}

async function buildStackDetail(name: string) {
  const [stack] = await db
    .select()
    .from(stacks)
    .where(eq(stacks.name, name))
    .limit(1);
  if (!stack) throw new HttpError(404, "Stack not found");

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
}

async function runDeploy(name: string) {
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
    throw new HttpError(
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
      throw new HttpError(
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

  return { success: result.success, output: result.output };
}

export const stackRoutes = new Elysia()
  .get("/api/stacks", async () => {
    const allStacks = await db
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
      .leftJoin(repositories, eq(stacks.repositoryId, repositories.id));

    const envCounts = await db
      .select({ stackId: stackEnvVars.stackId, count: count() })
      .from(stackEnvVars)
      .groupBy(stackEnvVars.stackId);
    const countByStackId = new Map(
      envCounts.map((r) => [r.stackId, r.count])
    );

    return allStacks.map((stack) => ({
      ...stack,
      envVarCount: countByStackId.get(stack.id) ?? 0,
    }));
  })
  .get("/api/stacks/:name", async ({ params }) => {
    return buildStackDetail(requireName(params.name));
  })
  .post("/api/stacks/:name/deploy", async ({ params }) => {
    return runDeploy(requireName(params.name));
  })
  .post("/api/stacks/:name/stop", async ({ params }) => {
    const name = requireName(params.name);
    const lookup = await getStackAndRepo(name);
    const { stack, composePath } = lookup;

    const result = await runLoggedAction({
      title: `Stopping ${name}`,
      action: "stop",
      stackId: stack.id,
      statusOnSuccess: "stopped",
      run: (onOutput) => stopStack(composePath, stack.name, onOutput),
    });

    return { success: result.success, output: result.output };
  })
  .post("/api/stacks/:name/restart", async ({ params }) => {
    const name = requireName(params.name);
    const lookup = await getStackAndRepo(name);
    const { stack, composePath } = lookup;

    const result = await runLoggedAction({
      title: `Restarting ${name}`,
      action: "restart",
      stackId: stack.id,
      run: (onOutput) => restartStack(composePath, stack.name, onOutput),
    });

    return { success: result.success, output: result.output };
  })
  .post("/api/stacks/:name/pull", async ({ params }) => {
    const name = requireName(params.name);
    const lookup = await getStackAndRepo(name);
    const { stack, composePath } = lookup;

    const result = await runLoggedAction({
      title: `Pulling images for ${name}`,
      action: "pull",
      stackId: stack.id,
      run: (onOutput) => pullStack(composePath, stack.name, onOutput),
    });

    return { success: result.success, output: result.output };
  })
  .put("/api/stacks/:name/compose", async ({ params, body }) => {
    const name = requireName(params.name);
    const { content } = parseBody(saveComposeBodySchema, body);
    const { composePath } = await getStackAndRepo(name);

    let parsed: unknown;
    try {
      parsed = parse(content);
    } catch (e) {
      throw new HttpError(
        400,
        `Invalid compose file: ${e instanceof Error ? e.message : "unknown error"}`
      );
    }
    if (
      !parsed ||
      typeof parsed !== "object" ||
      !("services" in parsed) ||
      typeof (parsed as { services: unknown }).services !== "object"
    ) {
      throw new HttpError(
        400,
        "Invalid compose file: missing 'services' section"
      );
    }

    mkdirSync(dirname(composePath), { recursive: true });
    writeFileSync(composePath, content, "utf-8");

    return { success: true };
  })
  .put("/api/stacks/:name/env", async ({ params, body }) => {
    const name = requireName(params.name);
    const { entries } = parseBody(saveEnvBodySchema, body);
    const lookup = await getStackAndRepo(name);
    const { stack } = lookup;

    const existing = await db
      .select()
      .from(stackEnvVars)
      .where(eq(stackEnvVars.stackId, stack.id));
    const existingByKey = new Map(existing.map((e) => [e.key, e.value]));

    db.transaction((tx) => {
      tx.delete(stackEnvVars)
        .where(eq(stackEnvVars.stackId, stack.id))
        .run();

      if (entries.length > 0) {
        tx.insert(stackEnvVars)
          .values(
            entries.map((e) => ({
              stackId: stack.id,
              key: e.key,
              // null means "leave unchanged": keep the stored value, default "".
              value: e.value ?? existingByKey.get(e.key) ?? "",
              isSecret: e.isSecret,
            }))
          )
          .run();
      }
    });

    return { success: true };
  })
  .put("/api/stacks/:name/secrets", async ({ params, body }) => {
    const name = requireName(params.name);
    const { entries } = parseBody(saveSecretsBodySchema, body);
    const lookup = await getStackAndRepo(name);
    const { stack } = lookup;

    const existing = await db
      .select()
      .from(stackSecrets)
      .where(eq(stackSecrets.stackId, stack.id));
    const existingByName = new Map(existing.map((s) => [s.name, s.value]));

    db.transaction((tx) => {
      tx.delete(stackSecrets)
        .where(eq(stackSecrets.stackId, stack.id))
        .run();

      if (entries.length > 0) {
        tx.insert(stackSecrets)
          .values(
            entries.map((e) => ({
              stackId: stack.id,
              name: e.name,
              // null means "leave unchanged": keep the stored value, default "".
              value: e.value ?? existingByName.get(e.name) ?? "",
            }))
          )
          .run();
      }
    });

    return { success: true };
  });
