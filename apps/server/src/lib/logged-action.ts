import { eq } from "drizzle-orm";
import { db, deploymentLogs, stacks } from "@laber/db";
import { createActivity, appendOutput, finishActivity } from "./activity";
import { ActionFailedError } from "./errors";

async function recordActionOutcome(options: {
  activityId: string;
  stackId?: string;
  isCore?: boolean;
  action: string;
  statusOnSuccess?: "deployed" | "stopped" | "error";
  result: { success: boolean; output: string };
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
) => Promise<{ output: string; value: T }>;

/**
 * Single failure contract for logged actions: `run` streams progress via
 * `onOutput` and returns `{ output, value }` on success — it throws on
 * operational failure. The boolean lives only inside `recordActionOutcome`
 * for logging; callers get `{ output, value }` or an exception, never a
 * second success flag to remember.
 *
 * A throwing `run` never leaves the activity stuck on "running": the
 * streamed transcript plus the error line is persisted to the deployment
 * log, then operational failures (`ActionFailedError`) are mapped to the
 * contextual `failureMessage` while domain errors keep their status at the
 * edge. The full transcript stays in the deployment log and activity
 * stream; the wire message stays short.
 */
export async function runLoggedAction<T = void>(options: {
  title: string;
  action: string;
  stackId?: string;
  isCore?: boolean;
  statusOnSuccess?: "deployed" | "stopped" | "error";
  failureMessage?: string;
  run: LoggedActionRun<T>;
}): Promise<{ output: string; value: T }> {
  const failureMessage = options.failureMessage ?? `${options.title} failed`;
  const activity = createActivity(options.title);

  // Everything `run` streams. On failure `run` threw instead of returning
  // output, so this transcript (plus the error line below) is what the
  // deployment log records — no second encoding of the same failure.
  let transcript = "";
  const onOutput = (chunk: string) => {
    transcript += chunk;
    appendOutput(activity.id, chunk);
  };

  try {
    const { output, value } = await options.run(onOutput);
    await recordActionOutcome({
      activityId: activity.id,
      stackId: options.stackId,
      isCore: options.isCore,
      action: options.action,
      statusOnSuccess: options.statusOnSuccess,
      result: { success: true, output },
    });
    return { output, value };
  } catch (e) {
    const detail = e instanceof Error ? e.message : "Unknown error";
    transcript += `\n${detail}\n`;
    appendOutput(activity.id, `\n${detail}\n`);
    await recordActionOutcome({
      activityId: activity.id,
      stackId: options.stackId,
      isCore: options.isCore,
      action: options.action,
      result: { success: false, output: transcript },
    });
    if (e instanceof ActionFailedError) {
      throw new ActionFailedError(failureMessage);
    }
    throw e;
  }
}
