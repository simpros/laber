import { runComposeCommand } from "./compose-cli";
import { downProject } from "./compose-cli";
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
  stackIdentity: (stackId: string) => ActionIdentity;
  holdsRepoLock: boolean;
  title: (label: string) => string;
  failureMessage: (label: string) => string;
  run: (ctx: OpCtx, onOutput: (chunk: string) => void) => Promise<{
    output: string;
  }>;
};

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

// Stop holds the repo lock (it removes containers the sync probe reads); restart/pull run unlocked and never write status.
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
  return withLockedStack(name, async ({ stack, composePath }) =>
    runLifecycleOp(
      op,
      def.stackIdentity(stack.id),
      { projectName: stack.name, composePath, label: stack.name }
    )
  );
}

type CoreOp = "stop" | "restart";

export function runCoreOp(op: CoreOp): Promise<{ output: string }> {
  return runLifecycleOp(op, { kind: "core" }, {
    projectName: CORE_PROJECT,
    composePath: getCoreComposePath(),
    label: "core services",
  });
}
