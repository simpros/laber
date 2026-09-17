import { eq } from "drizzle-orm";
import { db, deploymentLogs, stacks } from "@laber/db";
import { createActivity, appendOutput, finishActivity } from "./activity";
import { ActionFailedError } from "./errors";

/**
 * Success-only transitions. There is no `"error"` member: callers declare
 * only the success transition for actions that own runtime intent
 * (deploy/stop). A tracked failure of those same actions moves the stack to
 * `"error"` automatically. Actions that do not change desired runtime
 * (pull/restart) pass `stackId` (log attribution) but no `statusOnSuccess`
 * and never touch `stacks.status` — last-action outcome already lives in
 * `deployment_logs` / activity.
 */
export type StackStatusOnSuccess = "deployed" | "stopped";

async function recordActionOutcome(options: {
  activityId: string;
  stackId?: string;
  isCore?: boolean;
  action: string;
  statusOnSuccess?: StackStatusOnSuccess;
  result: { success: boolean; output: string };
}): Promise<void> {
  const outcome = options.result.success ? "success" : "error";

  // One atomic boundary for durable state: the deployment log and the
  // status transition commit together, so sync/delete gates never read a
  // log without its status (or vice versa). The in-memory activity finishes
  // only after the tx commits — in `finally`, so even a DB failure cannot
  // leave it stuck on "running".
  try {
    db.transaction((tx) => {
      tx.insert(deploymentLogs)
        .values({
          stackId: options.stackId,
          isCore: options.isCore ?? false,
          action: options.action,
          status: outcome,
          output: options.result.output,
        })
        .run();

      // The one status state machine: only actions that own runtime intent
      // (deploy/stop, the ones passing `statusOnSuccess`) move the column.
      // Success applies the caller's transition; operational failure of those
      // same actions moves a tracked stack to "error" so sync/delete gates stop
      // trusting a stale "deployed" after a failed redeploy. Pull/restart pass
      // no transition and leave the column alone on success *and* failure — a
      // failed pull must not clear the "deployed" marker while containers keep
      // running, or sync would reconcile the still-live stack away.
      if (options.stackId && options.statusOnSuccess !== undefined) {
        const next = options.result.success
          ? options.statusOnSuccess
          : "error";
        const stackId = options.stackId;
        tx.update(stacks)
          .set({ status: next, updatedAt: new Date() })
          .where(eq(stacks.id, stackId))
          .run();
      }
    });
  } finally {
    finishActivity(options.activityId, outcome);
  }
}

export type LoggedActionRun<T> = (
  onOutput: (chunk: string) => void
) => Promise<{ output: string; value: T }>;

export type LoggedActionRunVoid = (
  onOutput: (chunk: string) => void
) => Promise<{ output: string }>;

type LoggedActionBase = {
  title: string;
  action: string;
  stackId?: string;
  isCore?: boolean;
  statusOnSuccess?: StackStatusOnSuccess;
  failureMessage?: string;
};

/**
 * Single failure contract for logged actions: `run` streams progress via
 * `onOutput` and returns `{ output, value }` on success — it throws on
 * operational failure. The boolean lives only inside `recordActionOutcome`
 * for logging; callers get `{ output, value }` or an exception, never a
 * second success flag to remember.
 *
 * Value-less actions return `{ output }` only (first overload); actions
 * with a result return `{ output, value }` (second overload).
 *
 * A throwing `run` never leaves the activity stuck on "running": the
 * streamed transcript plus the error line is persisted to the deployment
 * log, the stack (when the action owns runtime intent — see
 * `statusOnSuccess`) moves to `"error"`, then operational failures
 * (`ActionFailedError`) are mapped to the contextual `failureMessage`
 * while domain errors keep their kind at the edge. The full transcript
 * stays in the deployment log and activity stream; the wire message stays
 * short. Log insert and status update commit in one transaction; the
 * in-memory activity finishes only after that tx (so a crash between them
 * cannot produce "finished activity / missing log / stale status").
 */
export async function runLoggedAction(options: LoggedActionBase & {
  run: LoggedActionRunVoid;
}): Promise<{ output: string }>;
export async function runLoggedAction<T>(
  options: LoggedActionBase & { run: LoggedActionRun<T> }
): Promise<{ output: string; value: T }>;
export async function runLoggedAction<T>(
  options: LoggedActionBase & {
    run: (onOutput: (chunk: string) => void) => Promise<{
      output: string;
      value?: T;
    }>;
  }
): Promise<{ output: string; value?: T }> {
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
      // Forwarded so deploy/stop failures still move the stack to "error";
      // pull/restart pass `stackId` but no transition and leave the column
      // alone (see above).
      statusOnSuccess: options.statusOnSuccess,
      result: { success: false, output: transcript },
    });
    if (e instanceof ActionFailedError) {
      throw new ActionFailedError(failureMessage);
    }
    throw e;
  }
}
