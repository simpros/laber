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

export async function runLoggedAction(options: {
  title: string;
  action: string;
  stackId?: string;
  isCore?: boolean;
  statusOnSuccess?: "deployed" | "stopped" | "error";
  run: (onOutput: (chunk: string) => void) => Promise<LoggedActionResult>;
}): Promise<LoggedActionResult> {
  const activity = createActivity(options.title);

  // A throwing `run` must never leave the activity stuck on "running":
  // finish the stream, persist the failure to the deployment log, then
  // rethrow so domain errors keep their status at the edge.
  let result: LoggedActionResult;
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

  return result;
}

/**
 * Single failure contract for logged actions: a failed compose/git run is an
 * error, not a 200 `{ success: false }`. The message stays short — the full
 * transcript is already in the deployment log and the activity stream.
 */
export function ensureActionSuccess(
  result: LoggedActionResult,
  fallbackMessage: string
): { success: true; output: string } {
  if (!result.success) {
    throw new ActionFailedError(fallbackMessage);
  }
  return { success: true, output: result.output };
}
