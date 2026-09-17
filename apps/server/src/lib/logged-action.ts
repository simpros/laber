import { eq } from "drizzle-orm";
import { db, deploymentLogs, stacks } from "@laber/db";
import { createActivity, appendOutput, finishActivity } from "./activity";
import type { Activity } from "./activity";
import { ActionFailedError } from "./errors";

/**
 * Exhaustive lifecycle identity: every variant is fully specified, so
 * attribution (`deployment_logs.stackId` / `isCore`) and the status
 * transition cannot drift into half-specified combinations by construction.
 * - `stack`: deploy/stop (own runtime intent) — carries the success
 *   transition (`onSuccess`).
 * - `stack-log`: pull/restart — carries the stack identity for log
 *   attribution but never touches `stacks.status` (last-action outcome
 *   already lives in `deployment_logs` / activity).
 * - `core`: core ops carry no stack row and never touch the column.
 *
 * There is no optional `statusOnSuccess?` and no `kind: "none"`: repo-level
 * ops (clone/sync/delete) are not deployments — they use `runActivity`
 * (transcript only) instead of writing orphan `deployment_logs` rows with
 * `stackId = null` that the dashboard would mistake for deploy history.
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

  // One durable boundary for the DB half: deployment log + status commit
  // together. The in-memory activity finishes only after the tx commits —
  // as `outcome` on success, as `"error"` when the tx itself throws (a
  // persist failure after a successful run must never read as success).
  // No `finally` here: the caller decides whether a throw is an
  // operational failure (record once) or a persist failure (already
  // finished — do not re-enter the failure path).
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

      // The one status state machine: only `stack` actions (deploy/stop, the
      // ones carrying `onSuccess`) move the column, and the column is
      // UI/history only — sync/delete never read it (removal is the
      // fail-closed Docker probe). `stack-log` (pull/restart) leaves the
      // column alone on success *and* failure, so a failed pull does not
      // paint the UI `"error"` while containers keep running.
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
    // Durable write failed: finish as error so nothing sticks on "running",
    // then rethrow for the caller to propagate WITHOUT recording a second
    // operational outcome.
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
 * log, the stack (when the action owns runtime intent — the `stack`
 * identity variant) moves to `"error"`, then
 * operational failures (`ActionFailedError`) are mapped to the contextual
 * `failureMessage` while domain errors keep their kind at the edge. The full
 * transcript stays in the deployment log and activity stream; the wire
 * message stays short.
 *
 * Run failure and persist failure are separate paths: a persist throw after
 * a successful `run` propagates directly (activity already finished as
 * error) instead of re-entering the operational-failure recording below —
 * so clients never see success→error finish flips or a second log attempt
 * for one action.
 */
/**
 * Shared transcript executor behind both public shells: creates the
 * activity, streams `run` progress into it, and returns the success payload
 * or `{ transcript, error }`. It never finishes the activity and never
 * persists — `runActivity` finishes, `runLoggedAction` records. One
 * try/catch for the streaming half so the next finish/persist fix cannot
 * drift one shell and leave the other wrong.
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

  // Everything `run` streams. On failure `run` threw instead of returning
  // output, so this transcript (plus the error line below) is what the
  // durable log records — no second encoding of the same failure.
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
      // Run AND persist failed: the activity is already finished as error
      // inside `recordActionOutcome`. Surface the operational cause (the
      // persist failure only means the durable row is missing) unless the
      // persist throw is itself a domain signal worth keeping — prefer the
      // original error so operators see why the action failed.
      console.error("Failed to persist action outcome:", persistError);
    }
    if (outcome.error instanceof ActionFailedError) {
      throw new ActionFailedError(failureMessage);
    }
    throw outcome.error;
  }

  // `run` succeeded: persist the success outcome. A throw here is a persist
  // failure, not an operational failure — the activity is already finished
  // as error, so propagate without recording a second (failure) outcome.
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
 * Transcript-only shell for repo-level ops (clone/sync/delete): SSE
 * activity transcript with the same throw-on-failure contract, but no
 * `deployment_logs` row and no status write. Those ops are not deployments —
 * routing them through `runLoggedAction` wrote orphan deploy rows
 * (`stackId = null`) that the dashboard mistook for deploy history.
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
