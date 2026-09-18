import { eq } from "drizzle-orm";
import { db, deploymentLogs, stacks } from "@laber/db";
import { createActivity, appendOutput, finishActivity } from "./activity";
import type { Activity } from "./activity";
import { ActionFailedError } from "./errors";

// Only kind "stack" moves stacks.status; stack-log and core never do.
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
    try {
      finishActivity(options.activityId, "error");
    } catch {
      // The persist error is what matters.
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
      console.error("Failed to persist action outcome:", persistError);
    }
    if (outcome.error instanceof ActionFailedError) {
      throw new ActionFailedError(failureMessage);
    }
    throw outcome.error;
  }

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
