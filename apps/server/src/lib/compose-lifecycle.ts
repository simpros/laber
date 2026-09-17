import { deployStack, type DeployOptions } from "./deploy";
import { runComposeCommand } from "./docker";
import { runLoggedAction } from "./logged-action";

type LifecycleMeta = {
  title: string;
  action: string;
  stackId?: string;
  isCore?: boolean;
  statusOnSuccess?: "deployed" | "stopped" | "error";
};

/**
 * The one compose-project runner behind every stack/core lifecycle button:
 * resolve nothing here, just run under logging. Status updates on success,
 * `ActionFailedError("<Title> failed")` on operational failure, domain
 * errors untouched. Callers are one-liners; policy changes land once.
 */
export async function runComposeCommandLifecycle(
  options: LifecycleMeta & {
    composePath: string;
    projectName: string;
    command: string[];
  }
): Promise<{ output: string }> {
  const { output } = await runLoggedAction({
    title: options.title,
    action: options.action,
    stackId: options.stackId,
    isCore: options.isCore,
    statusOnSuccess: options.statusOnSuccess,
    failureMessage: `${options.title} failed`,
    run: async (onOutput) => {
      const result = await runComposeCommand(
        options.composePath,
        options.command,
        options.projectName,
        onOutput
      );
      return { output: result.output, value: undefined };
    },
  });
  return { output };
}

export async function runDeployLifecycle(
  options: LifecycleMeta & {
    deploy: Omit<DeployOptions, "onOutput">;
  }
): Promise<{ output: string }> {
  const { output } = await runLoggedAction({
    title: options.title,
    action: options.action,
    stackId: options.stackId,
    isCore: options.isCore,
    statusOnSuccess: options.statusOnSuccess,
    failureMessage: `${options.title} failed`,
    run: async (onOutput) => {
      const result = await deployStack({ ...options.deploy, onOutput });
      return { output: result.output, value: undefined };
    },
  });
  return { output };
}
