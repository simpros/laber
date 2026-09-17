import { runComposeCommand } from "./compose-cli";
import { downProject } from "./compose-cli";
import { deployStack, type DeployOptions } from "./deploy";
import {
  runLoggedAction,
  type ActionIdentity,
} from "./logged-action";
import {
  getStackAndRepo,
  assertStackName,
  withLockedStack,
} from "./stack-context";
import { CORE_PROJECT, getCoreComposePath } from "./core-identity";

type LifecycleOp = "stop" | "restart" | "pull";

type OpCtx = {
  projectName: string;
  composePath: string;
};

type OpDef = {
  action: string;
  /** Full identity factory per row: stop owns runtime intent (`stack` with
   * `onSuccess: "stopped"`); restart/pull are log-only (`stack-log`). Each
   * row carries a complete `ActionIdentity` variant — callers never branch
   * on an optional, and `"deployed"` never appears here (deploy is not in
   * this table). */
  stackIdentity: (stackId: string) => ActionIdentity;
  /**
   * Whether the op mutates the removable inputs the sync/delete lock owns.
   * Stop brings containers down (the probe's ground truth); restart/pull
   * neither start nor remove projects, so they run unlocked instead of
   * serializing on a mutex they do not write.
   */
  holdsRepoLock: boolean;
  title: (label: string) => string;
  failureMessage: (label: string) => string;
  run: (ctx: OpCtx, onOutput: (chunk: string) => void) => Promise<{
    output: string;
  }>;
};

// The one lifecycle table for every stoppable project (stacks and core):
// stop is `downProject` by project name (compose file optional, label
// fallback); restart/pull are plain compose argv. Each op owns its `run`,
// so callers have no `if (op === ...)` branch — the table is the
// discriminator. Stacks label ops with the stack name, core with
// "core services" (same strings as before, one definition).
const OPS: Record<LifecycleOp, OpDef> = {
  stop: {
    action: "stop",
    holdsRepoLock: true,
    stackIdentity: (stackId) => ({
      kind: "stack",
      stackId,
      onSuccess: "stopped",
    }),
    title: (label) => `Stopping ${label}`,
    failureMessage: (label) => `Stopping ${label} failed`,
    run: (ctx, onOutput) =>
      downProject({
        projectName: ctx.projectName,
        composePath: ctx.composePath,
        onOutput,
      }),
  },
  restart: {
    action: "restart",
    holdsRepoLock: false,
    stackIdentity: (stackId) => ({ kind: "stack-log", stackId }),
    title: (label) => `Restarting ${label}`,
    failureMessage: (label) => `Restarting ${label} failed`,
    run: (ctx, onOutput) =>
      runComposeCommand(ctx.composePath, ["restart"], ctx.projectName, onOutput),
  },
  pull: {
    action: "pull",
    holdsRepoLock: false,
    stackIdentity: (stackId) => ({ kind: "stack-log", stackId }),
    title: (label) => `Pulling images for ${label}`,
    failureMessage: (label) => `Pulling images for ${label} failed`,
    run: (ctx, onOutput) =>
      runComposeCommand(ctx.composePath, ["pull"], ctx.projectName, onOutput),
  },
};

/**
 * The one logged-lifecycle shell for every stoppable project: `runStackOp`
 * and `runCoreOp` only resolve identity + compose path, then run the table
 * def through here — so the status machine, activity title, and failure
 * phrasing live once. Identity is `ActionIdentity` directly: no second
 * twin union remapping 1:1 into it.
 */
function runLifecycleOp(
  op: LifecycleOp,
  identity: ActionIdentity,
  ctx: OpCtx & { label: string }
): Promise<{ output: string }> {
  const def = OPS[op];
  return runLoggedAction({
    title: def.title(ctx.label),
    action: def.action,
    identity,
    failureMessage: def.failureMessage(ctx.label),
    run: async (onOutput) =>
      def.run(
        { projectName: ctx.projectName, composePath: ctx.composePath },
        onOutput
      ),
  });
}

/**
 * Table-driven stack lifecycle: `runStackOp(name, "stop")` instead of three
 * near-identical wrappers. The table row owns the identity variant outright
 * (stop → `stack` with `onSuccess`; restart/pull → `stack-log` for
 * attribution with no status write — they do not change desired runtime).
 *
 * Stop holds the per-repo lock: it removes the very containers the sync
 * removable probe reads, so an unlocked stop racing a sync probe→commit
 * would orphan a live project under a deleted row. Restart/pull neither
 * start nor remove projects, so the table leaves them unlocked.
 */
export async function runStackOp(
  name: string,
  op: LifecycleOp
): Promise<{ output: string }> {
  assertStackName(name);
  const def = OPS[op];
  if (!def.holdsRepoLock) {
    const { stack, composePath } = await getStackAndRepo(name);
    return runLifecycleOp(
      op,
      def.stackIdentity(stack.id),
      { projectName: stack.name, composePath, label: stack.name }
    );
  }
  // Stop removes the containers the sync probe reads: same `withLockedStack`
  // choreography as deploy, one helper instead of a copy-pasted lock block.
  return withLockedStack(name, async ({ stack, composePath }) =>
    runLifecycleOp(
      op,
      def.stackIdentity(stack.id),
      { projectName: stack.name, composePath, label: stack.name }
    )
  );
}

type CoreOp = "stop" | "restart";

/** Table-driven core lifecycle: `runCoreOp("stop")`. Core shares the one
 * `OPS` table with stacks (same `downProject` stop, same argv restart) —
 * only the identity (project, label) differs, resolved here so routes never
 * own the compose path. Core has no stack row, so no status commit by
 * construction. */
export function runCoreOp(op: CoreOp): Promise<{ output: string }> {
  return runLifecycleOp(op, { kind: "core" }, {
    projectName: CORE_PROJECT,
    composePath: getCoreComposePath(),
    label: "core services",
  });
}

/**
 * The one logged-deploy shell, next to the other lifecycle verbs: stack
 * `deployStackByName` and `deployCore` only resolve inputs + identity, then
 * run through here — so deploy is a table peer, not a hand-rolled twin that
 * open-codes `runLoggedAction` + `deployStack` twice. `deploy.ts` stays the
 * Docker/compensation policy.
 */
export function runLoggedDeploy(options: {
  title: string;
  action: string;
  identity: ActionIdentity;
  failureMessage?: string;
  deploy: Omit<DeployOptions, "onOutput">;
}): Promise<{ output: string }> {
  return runLoggedAction({
    title: options.title,
    action: options.action,
    identity: options.identity,
    failureMessage: options.failureMessage,
    run: async (onOutput) => {
      const result = await deployStack({ ...options.deploy, onOutput });
      return { output: result.output };
    },
  });
}
