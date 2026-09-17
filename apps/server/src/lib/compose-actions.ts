import { deployStack, type DeployOptions } from "./deploy";
import { runComposeCommand } from "./docker";
import { runLoggedAction, type StackStatusOnSuccess } from "./logged-action";

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
