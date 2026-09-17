import { deployStack, type DeployOptions } from "./deploy";
import { runComposeCommand } from "./compose-cli";
import { downProject } from "./compose-cli";
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
    statusOnSuccess?: StackStatusOnSuccess;
    failureMessage: (name: string) => string;
  }
> = {
  stop: {
    title: (name) => `Stopping ${name}`,
    action: "stop",
    statusOnSuccess: "stopped",
    failureMessage: (name) => `Stopping ${name} failed`,
  },
  restart: {
    title: (name) => `Restarting ${name}`,
    action: "restart",
    failureMessage: (name) => `Restarting ${name} failed`,
  },
  pull: {
    title: (name) => `Pulling images for ${name}`,
    action: "pull",
    failureMessage: (name) => `Pulling images for ${name} failed`,
  },
};

// Only restart/pull are compose-argv invocations. Stop is project teardown
// by name — there is exactly one "bring it down" protocol, shared with repo
// delete, and it needs no compose file.
const STACK_ARGV: Record<"restart" | "pull", string[]> = {
  restart: ["restart"],
  pull: ["pull"],
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
  const meta = {
    title: def.title(name),
    action: def.action,
    stackId: stack.id,
    statusOnSuccess: def.statusOnSuccess,
    failureMessage: def.failureMessage(name),
  };
  if (op === "stop") {
    return runLoggedAction({
      ...meta,
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
  return loggedComposeAction({
    ...meta,
    composePath,
    projectName: stack.name,
    argv: STACK_ARGV[op],
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
