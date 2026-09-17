import { eq } from "drizzle-orm";
import { db, deploymentLogs, stacks } from "@laber/db";
import { createActivity, appendOutput, finishActivity } from "./activity";
import { ActionFailedError } from "./errors";

export type LoggedActionResult = {
  success: boolean;
  output: string;
};

async function recordActionOutcome(options: {
  activityId: string;
  stackId?: string;
  isCore?: boolean;
  action: string;
  statusOnSuccess?: "deployed" | "stopped" | "error";
  result: LoggedActionResult;
}): Promise<void> {
  finishActivity(options.activityId, options.result.success ? "success" : "error");

  await db.insert(deploymentLogs).values({
    stackId: options.stackId,
    isCore: options.isCore ?? false,
    action: options.action,
    status: options.result.success ? "success" : "error",
    output: options.result.output,
  });

  if (
    options.result.success &&
    options.statusOnSuccess &&
    options.stackId
  ) {
    const stackId = options.stackId;
    await db
      .update(stacks)
      .set({ status: options.statusOnSuccess, updatedAt: new Date() })
      .where(eq(stacks.id, stackId));
  }
}

export type LoggedActionRun<T> = (
  onOutput: (chunk: string) => void
) => Promise<LoggedActionResult & { value?: T }>;

/**
 * Single failure contract for logged actions: the run reports
 * `{ success, output }` (plus an optional `value` on success) and this
 * throws `ActionFailedError` with a short message on failure. The boolean
 * lives only here for logging — callers get `{ success: true, output,
 * value }` or an exception, never a second `ensureActionSuccess` step.
 * The full transcript stays in the deployment log and activity stream.
 */
export async function runLoggedAction<T = void>(options: {
  title: string;
  action: string;
  stackId?: string;
  isCore?: boolean;
  statusOnSuccess?: "deployed" | "stopped" | "error";
  failureMessage?: string;
  run: LoggedActionRun<T>;
}): Promise<{ success: true; output: string; value: T }> {
  const failureMessage = options.failureMessage ?? `${options.title} failed`;
  const activity = createActivity(options.title);

  // A throwing `run` must never leave the activity stuck on "running":
  // finish the stream, persist the failure to the deployment log, then
  // rethrow so domain errors keep their status at the edge.
  let result: LoggedActionResult & { value?: T };
  try {
    result = await options.run((chunk) => appendOutput(activity.id, chunk));
  } catch (e) {
    const output = e instanceof Error ? e.message : "Unknown error";
    appendOutput(activity.id, `\n${output}\n`);
    await recordActionOutcome({
      activityId: activity.id,
      stackId: options.stackId,
      isCore: options.isCore,
      action: options.action,
      result: { success: false, output },
    });
    throw e;
  }

  await recordActionOutcome({
    activityId: activity.id,
    stackId: options.stackId,
    isCore: options.isCore,
    action: options.action,
    statusOnSuccess: options.statusOnSuccess,
    result,
  });

  if (!result.success) {
    throw new ActionFailedError(failureMessage);
  }

  return { success: true, output: result.output, value: result.value as T };
}
