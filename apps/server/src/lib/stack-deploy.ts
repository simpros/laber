import { db, stackEnvVars, stackSecrets } from "@laber/db";
import { eq } from "drizzle-orm";
import { loadCompose } from "./compose-parse";
import { extractNetworkName } from "./compose-services";
import type { DeployOptions } from "./deploy";
import { runLoggedDeploy } from "./deploy";
import { type getStackAndRepo, withLockedStack } from "./stack-context";
import { ValidationError } from "./errors";

type StackRow = Awaited<ReturnType<typeof getStackAndRepo>>["stack"];

/**
 * Deploy input resolution (env map, compose document, secret files with a
 * missing-value gate), resolved once under the lock by locked callers.
 */
export async function resolveStackDeployInputsFor(
  stack: StackRow,
  composePath: string
): Promise<{
  stackId: string;
  repositoryId: string;
  composeRaw: string;
  deploy: Omit<DeployOptions, "onOutput" | "composeBytes">;
}> {
  const envVars = await db
    .select()
    .from(stackEnvVars)
    .where(eq(stackEnvVars.stackId, stack.id));

  const envMap: Record<string, string> = {};
  for (const ev of envVars) envMap[ev.key] = ev.value;

  // A broken compose or missing secret fails instead of producing a secret-less deploy with a stale network name.
  const { raw, doc, secrets: defs } = loadCompose(composePath, {
    missing: "error",
    errorPrefix: "Cannot deploy",
  });
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

  return {
    stackId: stack.id,
    repositoryId: stack.repositoryId,
    composeRaw: raw,
    deploy: {
      composePath,
      envVars: envMap,
      secretFiles,
      networkName,
      projectName: stack.name,
    },
  };
}

export async function deployStackByName(name: string) {
  // Deploy holds the per-repo lock (`up -d` creates the containers the sync
  // probe reads), and the validated bytes travel as a snapshot live-tree writers cannot swap mid-attempt.
  return withLockedStack(name, async ({ stack, composePath }) => {
    const { stackId, deploy, composeRaw } =
      await resolveStackDeployInputsFor(stack, composePath);
    return runLoggedDeploy({
      title: `Deploying ${name}`,
      action: "deploy",
      identity: { kind: "stack", stackId, onSuccess: "deployed" },
      failureMessage: `Deploying ${name} failed`,
      deploy: { ...deploy, composeBytes: composeRaw },
    });
  });
}
