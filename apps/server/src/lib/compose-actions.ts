import { deployStack, type DeployOptions } from "./deploy";
import { runComposeCommand, downProject } from "./docker";
import {
  runLoggedAction,
  type StackStatusOnSuccess,
} from "./logged-action";
import { getStackAndRepo, assertStackName } from "./config";

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

const STACK_OPS: Record<
  StackOp,
  {
    title: (name: string) => string;
    action: string;
    argv: string[];
    statusOnSuccess?: StackStatusOnSuccess;
    failureMessage: (name: string) => string;
  }
> = {
  stop: {
    title: (name) => `Stopping ${name}`,
    action: "stop",
    argv: ["down"],
    statusOnSuccess: "stopped",
    failureMessage: (name) => `Stopping ${name} failed`,
  },
  restart: {
    title: (name) => `Restarting ${name}`,
    action: "restart",
    argv: ["restart"],
    failureMessage: (name) => `Restarting ${name} failed`,
  },
  pull: {
    title: (name) => `Pulling images for ${name}`,
    action: "pull",
    argv: ["pull"],
    failureMessage: (name) => `Pulling images for ${name} failed`,
  },
};

/**
 * Table-driven stack lifecycle: `runStackOp(name, "stop")` instead of three
 * near-identical wrappers. Compose argv lives here, not in routes; restart
 * and pull carry `stackId` but no `statusOnSuccess`, so they never touch
 * `stacks.status` (they do not change desired runtime).
 */
export async function runStackOp(
  name: string,
  op: StackOp
): Promise<{ output: string }> {
  assertStackName(name);
  const def = STACK_OPS[op];
  const { stack, composePath } = await getStackAndRepo(name);
  return loggedComposeAction({
    title: def.title(name),
    action: def.action,
    stackId: stack.id,
    statusOnSuccess: def.statusOnSuccess,
    failureMessage: def.failureMessage(name),
    composePath,
    projectName: stack.name,
    argv: def.argv,
  });
}

type CoreOp = "stop" | "restart";

const CORE_OPS: Record<
  CoreOp,
  {
    title: string;
    action: string;
    argv: string[];
    failureMessage: string;
  }
> = {
  stop: {
    title: "Stopping core services",
    action: "stop",
    argv: ["down"],
    failureMessage: "Stopping core services failed",
  },
  restart: {
    title: "Restarting core services",
    action: "restart",
    argv: ["restart"],
    failureMessage: "Restarting core services failed",
  },
};

/** Table-driven core lifecycle: `runCoreOp("stop", composePath)`. */
export function runCoreOp(
  op: CoreOp,
  composePath: string
): Promise<{ output: string }> {
  const def = CORE_OPS[op];
  return loggedComposeAction({
    title: def.title,
    action: def.action,
    isCore: true,
    failureMessage: def.failureMessage,
    composePath,
    projectName: "laber-core",
    argv: def.argv,
  });
}

/**
 * Logged project teardown for repo delete: the same `downProject` primitive
 * stop uses, but without requiring the compose file (delete must work after
 * the file vanished out of band). Success moves the stack to `"stopped"`;
 * failure moves it to `"error"` via the shared status machine, so a partial
 * multi-stack delete leaves an honest column instead of a sync dead-end.
 * Rows are deleted by the caller only after every stack tore down.
 */
export async function teardownStackProject(
  name: string,
  options?: { title?: string; action?: string; failureMessage?: string }
): Promise<{ output: string }> {
  assertStackName(name);
  const { stack, composePath } = await getStackAndRepo(name);
  return runLoggedAction({
    title: options?.title ?? `Removing ${name}`,
    action: options?.action ?? "remove",
    stackId: stack.id,
    statusOnSuccess: "stopped",
    failureMessage: options?.failureMessage ?? `Removing ${name} failed`,
    run: async (onOutput) => {
      const result = await downProject({
        projectName: stack.name,
        composePath,
        onOutput,
      });
      return { output: result.output };
    },
  });
}
