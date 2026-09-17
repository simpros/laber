import { runComposeCommand } from "./compose-cli";
import { downProject } from "./compose-cli";
import {
  runLoggedAction,
  type ActionIdentity,
  type StackStatusOnSuccess,
} from "./logged-action";
import {
  getStackAndRepo,
  getComposePath,
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
 * Discriminated lifecycle target: a stack op carries its row identity plus
 * an explicit status decision; a core op carries no stack row by
 * construction. Delete-path teardown passes `statusOnSuccess: undefined`
 * explicitly (rows disappear right after) instead of a boolean that negates
 * the table row.
 */
export type LifecycleTarget =
  | {
      kind: "stack";
      stackId: string;
      projectName: string;
      composePath: string;
      label: string;
      statusOnSuccess?: StackStatusOnSuccess;
    }
  | {
      kind: "core";
      projectName: string;
      composePath: string;
      label: string;
    };

function identityForTarget(target: LifecycleTarget): ActionIdentity {
  return target.kind === "stack"
    ? {
        kind: "stack",
        stackId: target.stackId,
        statusOnSuccess: target.statusOnSuccess,
      }
    : { kind: "core" };
}

/**
 * The one logged-lifecycle shell for every stoppable project: stack ops
 * (`runStackOp`, `stopStackRow`) and core ops (`runCoreOp`) only resolve
 * identity + compose path, then run the table def through here — so the
 * status machine, activity title, and failure phrasing live once.
 */
function runLifecycleOp(
  op: LifecycleOp,
  target: LifecycleTarget
): Promise<{ output: string }> {
  const def = OPS[op];
  return runLoggedAction({
    title: def.title(target.label),
    action: def.action,
    identity: identityForTarget(target),
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
 * near-identical wrappers. Restart and pull carry the stack identity but no
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
    kind: "stack",
    stackId: stack.id,
    projectName: stack.name,
    composePath,
    label: stack.name,
    statusOnSuccess: OPS[op].statusOnSuccess,
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
 * second lookup per stack — but with `statusOnSuccess: undefined` passed
 * explicitly. Repo delete removes the rows in one transaction after every
 * down succeeds, so per-stop status flips would be writes to rows about to
 * disappear (and lies on partial failure). Activity + deployment-log history
 * is still recorded per stack; only the `stacks.status` column stays
 * untouched.
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
    kind: "stack",
    stackId: stack.id,
    projectName: stack.name,
    composePath,
    label: stack.name,
    statusOnSuccess: undefined,
  });
}

type CoreOp = "stop" | "restart";

/** Table-driven core lifecycle: `runCoreOp("stop")`. Core shares the one
 * `OPS` table with stacks (same `downProject` stop, same argv restart) —
 * only the identity (project, label) differs, resolved here so routes never
 * own the compose path. Core has no stack row, so no status commit by
 * construction. */
export function runCoreOp(op: CoreOp): Promise<{ output: string }> {
  return runLifecycleOp(op, {
    kind: "core",
    projectName: CORE_PROJECT,
    composePath: getCoreComposePath(),
    label: "core services",
  });
}
