import { runComposeCommand } from "./compose-cli";
import { downProject } from "./compose-cli";
import {
  runLoggedAction,
  type ActionIdentity,
  type StackStatusOnSuccess,
} from "./logged-action";
import {
  getStackAndRepo,
  assertStackName,
} from "./config";
import { CORE_PROJECT, getCoreComposePath } from "./core-identity";

type LifecycleOp = "stop" | "restart" | "pull";

type OpCtx = {
  projectName: string;
  composePath: string;
};

type OpDef = {
  action: string;
  statusOnSuccess?: StackStatusOnSuccess;
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
    statusOnSuccess: "stopped",
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
    title: (label) => `Restarting ${label}`,
    failureMessage: (label) => `Restarting ${label} failed`,
    run: (ctx, onOutput) =>
      runComposeCommand(ctx.composePath, ["restart"], ctx.projectName, onOutput),
  },
  pull: {
    action: "pull",
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
 * near-identical wrappers. Restart and pull carry the stack identity but no
 * `statusOnSuccess`, so they never touch `stacks.status` (they do not
 * change desired runtime).
 *
 * No per-repo lock: lifecycle ops never change the removable inputs the
 * sync/delete lock owns — the removable gate is the fail-closed Docker
 * probe, and `stacks.status` is UI/history. Stop's `"stopped"` commit and
 * pull/restart's log-only outcome cannot orphan a sync reconcile, so they
 * must not serialize on a mutex they do not write.
 */
export async function runStackOp(
  name: string,
  op: LifecycleOp
): Promise<{ output: string }> {
  assertStackName(name);
  const { stack, composePath } = await getStackAndRepo(name);
  return runLifecycleOp(
    op,
    {
      kind: "stack",
      stackId: stack.id,
      statusOnSuccess: OPS[op].statusOnSuccess,
    },
    { projectName: stack.name, composePath, label: stack.name }
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
