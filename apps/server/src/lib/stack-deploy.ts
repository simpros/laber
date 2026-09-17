import { existsSync } from "fs";
import { db, stackEnvVars, stackSecrets } from "@laber/db";
import { eq } from "drizzle-orm";
import { loadComposeDocument } from "./compose-parse";
import { extractNetworkName } from "./compose-services";
import type { DeployOptions } from "./deploy";
import { runLoggedDeploy } from "./compose-actions";
import { withRepoLock } from "./repo-lock";
import { getStackAndRepo, assertStackName } from "./config";
import { ValidationError } from "./errors";

/**
 * Deploy input resolution, out of the read-model façade (`stacks.ts` is
 * list + detail only): env map from the DB, compose document through the
 * one gate detail and save share, secret-file mapping with a missing-value
 * gate. Returns everything `deployStack` needs plus the stack row identity.
 */
export async function resolveStackDeployInputs(name: string): Promise<{
  stackId: string;
  repositoryId: string;
  deploy: Omit<DeployOptions, "onOutput">;
}> {
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
  // A missing file is its own product message; anything else that is not a
  // `ValidationError` (permissions, EISDIR, unexpected runtime failures)
  // propagates with its own kind instead of being relabeled "missing".
  if (!existsSync(composePath)) {
    throw new ValidationError("Cannot deploy: compose file is missing");
  }
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
    throw e;
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

  return {
    stackId: stack.id,
    repositoryId: stack.repositoryId,
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
  const { stackId, repositoryId, deploy } =
    await resolveStackDeployInputs(name);

  // Deploy holds the per-repo lock: `up -d` creates the very containers the
  // sync removable probe reads, so an unlocked deploy racing a sync
  // probe→commit would orphan a live project under a deleted row. The
  // `deployed`/`error` status commit stays UI/history — the lock is about
  // containers, not the column.
  return withRepoLock(repositoryId, () =>
    runLoggedDeploy({
      title: `Deploying ${name}`,
      action: "deploy",
      identity: { kind: "stack", stackId, onSuccess: "deployed" },
      failureMessage: `Deploying ${name} failed`,
      deploy,
    })
  );
}
