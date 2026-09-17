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
 * The one compose-argv lifecycle: stack and core stop/restart/pull are the
 * same shape (logged action around one `compose` invocation), so they share
 * this instead of forking twin shells in two modules. Actions that own
 * runtime intent (stop) pass `stackId` + `statusOnSuccess`; pull/restart
 * pass `stackId` (log attribution) but no `statusOnSuccess` and never touch
 * `stacks.status`.
 */
export function loggedComposeAction(
  options: LifecycleMeta & {
    composePath: string;
    projectName: string;
    argv: string[];
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
      const result = await runComposeCommand(
        options.composePath,
        options.argv,
        options.projectName,
        onOutput
      );
      return { output: result.output };
    },
  });
}

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

type StackOp = "stop" | "restart" | "pull";

type StackOpCtx = {
  stackName: string;
  composePath: string;
};

type StackOpDef = {
  title: (name: string) => string;
  action: string;
  statusOnSuccess?: StackStatusOnSuccess;
  failureMessage: (name: string) => string;
  run: (ctx: StackOpCtx, onOutput: (chunk: string) => void) => Promise<{
    output: string;
  }>;
};

// One teardown protocol for every stoppable project: `downProject` by name
// (compose file optional, label fallback). Restart/pull are plain compose
// argv. Each op owns its `run`, so `runStackOp` has no `if (op === ...)`
// branch — the table is the discriminator.
const STACK_OPS: Record<StackOp, StackOpDef> = {
  stop: {
    title: (name) => `Stopping ${name}`,
    action: "stop",
    statusOnSuccess: "stopped",
    failureMessage: (name) => `Stopping ${name} failed`,
    run: (ctx, onOutput) =>
      downProject({
        projectName: ctx.stackName,
        composePath: ctx.composePath,
        onOutput,
      }),
  },
  restart: {
    title: (name) => `Restarting ${name}`,
    action: "restart",
    failureMessage: (name) => `Restarting ${name} failed`,
    run: (ctx, onOutput) =>
      runComposeCommand(ctx.composePath, ["restart"], ctx.stackName, onOutput),
  },
  pull: {
    title: (name) => `Pulling images for ${name}`,
    action: "pull",
    failureMessage: (name) => `Pulling images for ${name} failed`,
    run: (ctx, onOutput) =>
      runComposeCommand(ctx.composePath, ["pull"], ctx.stackName, onOutput),
  },
};

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
  return runLoggedAction({
    title: def.title(name),
    action: def.action,
    stackId: stack.id,
    statusOnSuccess: def.statusOnSuccess,
    failureMessage: def.failureMessage(name),
    run: async (onOutput) =>
      def.run({ stackName: stack.name, composePath }, onOutput),
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
 * as `runStackOp(name, "stop")`, without re-entering `getStackAndRepo`.
 * Repo delete tears down N known rows; re-looking each up by name would be
 * N redundant queries for rows the caller already holds.
 */
export function stopStackRow(stack: StackRowLike): Promise<{
  output: string;
}> {
  const def = STACK_OPS.stop;
  const composePath = getComposePath(
    stack.repositoryId,
    stack.relativePath,
    stack.composeFile
  );
  return runLoggedAction({
    title: def.title(stack.name),
    action: def.action,
    stackId: stack.id,
    statusOnSuccess: def.statusOnSuccess,
    failureMessage: def.failureMessage(stack.name),
    run: async (onOutput) =>
      def.run({ stackName: stack.name, composePath }, onOutput),
  });
}

type CoreOp = "stop" | "restart";

type CoreOpDef = {
  title: string;
  action: string;
  failureMessage: string;
  run: (
    composePath: string,
    onOutput: (chunk: string) => void
  ) => Promise<{ output: string }>;
};

// Core shares the one teardown protocol: stop is `downProject` by project
// name (recovers when the core compose file vanished out of band), restart
// is compose argv. Each op owns its `run`; the compose path is resolved
// here, never in routes.
const CORE_OPS: Record<CoreOp, CoreOpDef> = {
  stop: {
    title: "Stopping core services",
    action: "stop",
    failureMessage: "Stopping core services failed",
    run: (composePath, onOutput) =>
      downProject({
        projectName: CORE_PROJECT,
        composePath,
        onOutput,
      }),
  },
  restart: {
    title: "Restarting core services",
    action: "restart",
    failureMessage: "Restarting core services failed",
    run: (composePath, onOutput) =>
      runComposeCommand(
        composePath,
        ["restart"],
        CORE_PROJECT,
        onOutput
      ),
  },
};

/** Table-driven core lifecycle: `runCoreOp("stop")`. */
export function runCoreOp(op: CoreOp): Promise<{ output: string }> {
  const def = CORE_OPS[op];
  const composePath = getCoreComposePath();
  return runLoggedAction({
    title: def.title,
    action: def.action,
    isCore: true,
    failureMessage: def.failureMessage,
    run: async (onOutput) => def.run(composePath, onOutput),
  });
}
