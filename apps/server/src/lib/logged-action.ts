import { eq } from "drizzle-orm";
import { db, deploymentLogs, stacks } from "@laber/db";
import { createActivity, appendOutput, finishActivity } from "./activity";
import type { Activity } from "./activity";
import { ActionFailedError } from "./errors";

/**
 * Only `stack` deploy/stop moves `stacks.status`; `stack-log`/`core` never
 * do. Repo ops use `runActivity` (transcript only) so the dashboard never mistakes them for deploy history.
 */
export type ActionIdentity =
  | { kind: "stack"; stackId: string; onSuccess: "deployed" | "stopped" }
  | { kind: "stack-log"; stackId: string }
  | { kind: "core" };

async function recordActionOutcome(options: {
  activityId: string;
  identity: ActionIdentity;
  action: string;
  result: { success: boolean; output: string };
}): Promise<void> {
  const outcome = options.result.success ? "success" : "error";

  // Deployment log + status commit together; the activity finishes only after
  // the tx commits, so a persist failure after a successful run never reads as success.
  try {
    db.transaction((tx) => {
      const stackId =
        options.identity.kind === "stack" ||
        options.identity.kind === "stack-log"
          ? options.identity.stackId
          : undefined;
      tx.insert(deploymentLogs)
        .values({
          stackId,
          isCore: options.identity.kind === "core",
          action: options.action,
          status: outcome,
          output: options.result.output,
        })
        .run();

      // Only `stack` moves the column (UI/history); `stack-log` leaves it
      // alone so a failed pull does not paint `"error"` while containers keep running.
      if (options.identity.kind === "stack") {
        const next = options.result.success
          ? options.identity.onSuccess
          : "error";
        const stackId = options.identity.stackId;
        tx.update(stacks)
          .set({ status: next, updatedAt: new Date() })
          .where(eq(stacks.id, stackId))
          .run();
      }
    });
  } catch (persistError) {
    // Already finished as error: propagate without recording a second outcome.
    try {
      finishActivity(options.activityId, "error");
    } catch {
      // best-effort: the persist error is what matters
    }
    throw persistError;
  }
  finishActivity(options.activityId, outcome);
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
  identity: ActionIdentity;
  failureMessage?: string;
};

/**
 * Shared streaming half behind both shells; never finishes or persists
 * (`runActivity` finishes, `runLoggedAction` records) so the two cannot drift.
 */
async function runTranscript<T>(
  title: string,
  run: (
    onOutput: (chunk: string) => void
  ) => Promise<{ output: string; value?: T }>
): Promise<
  | { ok: true; activity: Activity; output: string; value: T | undefined }
  | { ok: false; activity: Activity; error: unknown; transcript: string }
> {
  const activity = createActivity(title);

  // On failure `run` threw, so this transcript plus the error line is what the durable log records.
  let transcript = "";
  const onOutput = (chunk: string) => {
    transcript += chunk;
    appendOutput(activity.id, chunk);
  };

  try {
    const result = await run(onOutput);
    return { ok: true, activity, output: result.output, value: result.value };
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown error";
    transcript += `\n${detail}\n`;
    appendOutput(activity.id, `\n${detail}\n`);
    return { ok: false, activity, error, transcript };
  }
}

export async function runLoggedAction(
  options: LoggedActionBase & {
    run: LoggedActionRunVoid;
  }
): Promise<{ output: string }>;
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
  const outcome = await runTranscript<T>(options.title, options.run);

  if (!outcome.ok) {
    try {
      await recordActionOutcome({
        activityId: outcome.activity.id,
        identity: options.identity,
        action: options.action,
        result: { success: false, output: outcome.transcript },
      });
    } catch (persistError) {
      // Prefer the operational error: the persist failure only means the durable row is missing.
      console.error("Failed to persist action outcome:", persistError);
    }
    if (outcome.error instanceof ActionFailedError) {
      throw new ActionFailedError(failureMessage);
    }
    throw outcome.error;
  }

  // A throw here is a persist failure (activity already finished as error), not an operational one.
  await recordActionOutcome({
    activityId: outcome.activity.id,
    identity: options.identity,
    action: options.action,
    result: { success: true, output: outcome.output },
  });
  return { output: outcome.output, value: outcome.value };
}

type ActivityActionBase = {
  title: string;
  failureMessage?: string;
};

/**
 * Transcript-only shell for repo-level ops: no `deployment_logs` row and no
 * status write (those ops are not deployments).
 */
export async function runActivity(
  options: ActivityActionBase & { run: LoggedActionRunVoid }
): Promise<{ output: string }>;
export async function runActivity<T>(
  options: ActivityActionBase & { run: LoggedActionRun<T> }
): Promise<{ output: string; value: T }>;
export async function runActivity<T>(
  options: ActivityActionBase & {
    run: (onOutput: (chunk: string) => void) => Promise<{
      output: string;
      value?: T;
    }>;
  }
): Promise<{ output: string; value?: T }> {
  const failureMessage = options.failureMessage ?? `${options.title} failed`;
  const outcome = await runTranscript<T>(options.title, options.run);

  if (!outcome.ok) {
    finishActivity(outcome.activity.id, "error");
    if (outcome.error instanceof ActionFailedError) {
      throw new ActionFailedError(failureMessage);
    }
    throw outcome.error;
  }

  finishActivity(outcome.activity.id, "success");
  return { output: outcome.output, value: outcome.value };
}
