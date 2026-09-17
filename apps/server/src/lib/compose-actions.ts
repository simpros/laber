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

type LifecycleTarget = {
  projectName: string;
  composePath: string;
  /** Human label for activity titles / failure messages. */
  label: string;
  /** Stack identity: set for stack ops (log attribution + optional status). */
  stackId?: string;
  /** Core identity: set for core ops instead of `stackId`. */
  isCore?: boolean;
  /** Delete-path teardown records activity/logs but never touches the status
   * column (rows are deleted right after, or the down failed). */
  skipStatusCommit?: boolean;
};

/**
 * The one logged-lifecycle shell for every stoppable project: stack ops
 * (`runStackOp`, `stopStackRow`) and core ops (`runCoreOp`) only resolve
 * identity + compose path, then run the table def through here — so the
 * status machine, activity title, and failure phrasing live once. No
 * aliases, no second executor.
 */
function runLifecycleOp(
  op: LifecycleOp,
  target: LifecycleTarget
): Promise<{ output: string }> {
  const def = OPS[op];
  return runLoggedAction({
    title: def.title(target.label),
    action: def.action,
    stackId: target.stackId,
    isCore: target.isCore,
    statusOnSuccess:
      target.skipStatusCommit === true ? undefined : def.statusOnSuccess,
    failureMessage: def.failureMessage(target.label),
    run: async (onOutput) =>
      def.run(
        { projectName: target.projectName, composePath: target.composePath },
        onOutput
      ),
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
  op: LifecycleOp
): Promise<{ output: string }> {
  assertStackName(name);
  const { stack, composePath } = await getStackAndRepo(name);
  return runLifecycleOp(op, {
    projectName: stack.name,
    composePath,
    label: stack.name,
    stackId: stack.id,
  });
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
 * as `runStackOp(name, "stop")` via the shared `runLifecycleOp` shell, so no
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
  return runLifecycleOp("stop", {
    projectName: stack.name,
    composePath,
    label: stack.name,
    stackId: stack.id,
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
  return runLifecycleOp(op, {
    projectName: CORE_PROJECT,
    composePath: getCoreComposePath(),
    label: "core services",
    isCore: true,
  });
}
