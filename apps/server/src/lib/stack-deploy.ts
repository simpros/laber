import { db, stackEnvVars, stackSecrets } from "@laber/db";
import { eq } from "drizzle-orm";
import { loadCompose } from "./compose-parse";
import { extractNetworkName } from "./compose-services";
import type { DeployOptions } from "./deploy";
import { runLoggedDeploy } from "./deploy";
import { getStackAndRepo, withLockedStack } from "./stack-context";
import { ValidationError } from "./errors";

type StackRow = Awaited<ReturnType<typeof getStackAndRepo>>["stack"];

/**
 * Deploy input resolution, out of the read-model façade (`stacks.ts` is
 * list + detail only): env map from the DB, compose document through the
 * one gate detail and save share, secret-file mapping with a missing-value
 * gate. Returns everything `deployStack` needs plus the stack row identity.
 *
 * Takes the already-resolved stack row + compose path so locked callers
 * (`deployStackByName` via `withLockedStack`) resolve once under the lock —
 * no second `getStackAndRepo` inside the critical section.
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

  // Deploy reads through the one compose gate detail and save use: a
  // broken compose or a missing secret fails instead of falling back
  // to cached DB values, so a bad file must not produce a secret-less deploy
  // with a stale network name. Missing-vs-invalid and the product phrasing
  // both live in `loadCompose` (`missing: "error"` types `doc` non-null, and
  // `errorPrefix` phrases every gate failure) — deploy is a call site, not a
  // policy owner.
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
  // Deploy holds the per-repo lock: `up -d` creates the very containers the
  // sync removable probe reads, so an unlocked deploy racing a sync
  // probe→commit would orphan a live project under a deleted row. The
  // `deployed`/`error` status commit stays UI/history — the lock is about
  // containers, not the column. Same `withLockedStack` choreography as stop:
  // lock key sampled cheaply outside, every removable input (DB row, compose,
  // env/secrets) re-resolved *under* the lock.
  //
  // Validated bytes === applied bytes: the frozen compose document travels as
  // `deploy.composeBytes`, and `deployStack` owns the sibling-temp snapshot
  // lifecycle (write → `-f <temp>` → delete). Live-tree writers (compose
  // save, sync pull) cannot swap the file between this attempt's gate check
  // and `up -d`.
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
