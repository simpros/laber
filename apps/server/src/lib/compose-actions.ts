import { deployStack, type DeployOptions } from "./deploy";
import { runComposeCommand } from "./compose-cli";
import { downProject } from "./compose-cli";
import {
  runLoggedAction,
  type StackStatusOnSuccess,
} from "./logged-action";
import {
  getStackAndRepo,
  getComposePath,
  assertStackName,
} from "./config";
import { CORE_PROJECT, getCoreComposePath } from "./core-identity";

type LifecycleMeta = {
  title: string;
  action: string;
  stackId?: string;
  isCore?: boolean;
  statusOnSuccess?: StackStatusOnSuccess;
  failureMessage: string;
};

/**
 * The one logged-deploy lifecycle: stack and core deploy differ only in how
 * they build `DeployOptions` (env/secret/network wiring), not in how the
 * run is logged. Callers build the options, this owns the logging.
 */
export function loggedDeployAction(
  options: LifecycleMeta & {
    deploy: Omit<DeployOptions, "onOutput">;
  }
): Promise<{ output: string }> {
  return runLoggedAction({
    title: options.title,
    action: options.action,
    stackId: options.stackId,
    isCore: options.isCore,
    statusOnSuccess: options.statusOnSuccess,
    failureMessage: options.failureMessage,
    run: async (onOutput) => {
      const result = await deployStack({
        ...options.deploy,
        onOutput,
      });
      return { output: result.output };
    },
  });
}

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

type StackOp = LifecycleOp;

type StackOpDef = OpDef;

// `STACK_OPS` is the one lifecycle table under its historic name: stack and
// core share it, so a policy change edits one row, not two tables.
const STACK_OPS: Record<StackOp, StackOpDef> = OPS;

/**
 * One logged-stack-op shell: resolve nothing here, just run the table def
 * against an already-resolved identity + compose path. `runStackOp` (after
 * `getStackAndRepo`) and `stopStackRow` (after `getComposePath`) share it,
 * so the status machine, activity title, and failure phrasing live once.
 * Whether the run may touch `stacks.status` is an explicit argument — never
 * a spread-override of the table row — so readers can see at the call site
 * if status is part of the op or deliberately skipped.
 */
function executeStackOp(
  def: StackOpDef,
  target: { id: string; name: string },
  composePath: string,
  opts?: { skipStatusCommit?: boolean }
): Promise<{ output: string }> {
  return runLoggedAction({
    title: def.title(target.name),
    action: def.action,
    stackId: target.id,
    statusOnSuccess:
      opts?.skipStatusCommit === true ? undefined : def.statusOnSuccess,
    failureMessage: def.failureMessage(target.name),
    run: async (onOutput) =>
      def.run({ projectName: target.name, composePath }, onOutput),
  });
}

/**
 * Table-driven stack lifecycle: `runStackOp(name, "stop")` instead of three
 * near-identical wrappers. Restart and pull carry `stackId` but no
 * `statusOnSuccess`, so they never touch `stacks.status` (they do not
 * change desired runtime).
 */
export async function runStackOp(
  name: string,
  op: StackOp
): Promise<{ output: string }> {
  assertStackName(name);
  const def = STACK_OPS[op];
  const { stack, composePath } = await getStackAndRepo(name);
  return executeStackOp(def, { id: stack.id, name: stack.name }, composePath);
}

export type StackRowLike = {
  id: string;
  name: string;
  repositoryId: string;
  relativePath: string;
  composeFile: string;
};

/**
 * Stop for an already-loaded stack row: the same logged `downProject` stop
 * as `runStackOp(name, "stop")` via the shared `executeStackOp` shell, so no
 * second lookup per stack — but without `statusOnSuccess`. Repo delete
 * removes the rows in one transaction after every down succeeds, so
 * per-stack status commits would be writes to rows about to disappear (and
 * lies on partial failure). Activity + deployment-log history is still
 * recorded per stack; only the `stacks.status` column stays untouched.
 */
export function stopStackRow(stack: StackRowLike): Promise<{
  output: string;
}> {
  const composePath = getComposePath(
    stack.repositoryId,
    stack.relativePath,
    stack.composeFile
  );
  return executeStackOp(STACK_OPS.stop, stack, composePath, {
    skipStatusCommit: true,
  });
}

type CoreOp = "stop" | "restart";

/** Table-driven core lifecycle: `runCoreOp("stop")`. Core shares the one
 * `OPS` table with stacks (same `downProject` stop, same argv restart) —
 * only the identity (project, label, `isCore`) differs, resolved here so
 * routes never own the compose path. Core has no stack row, so no status
 * commit by construction (`stackId` unset). */
export function runCoreOp(op: CoreOp): Promise<{ output: string }> {
  const def = OPS[op];
  const composePath = getCoreComposePath();
  const label = "core services";
  return runLoggedAction({
    title: def.title(label),
    action: def.action,
    isCore: true,
    failureMessage: def.failureMessage(label),
    run: async (onOutput) =>
      def.run({ projectName: CORE_PROJECT, composePath }, onOutput),
  });
}
