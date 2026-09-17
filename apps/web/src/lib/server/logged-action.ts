import { eq } from "drizzle-orm";
import { db, deploymentLogs, stacks } from "@laber/db";
import { createActivity, appendOutput, finishActivity } from "./activity";

export type LoggedActionResult = {
  success: boolean;
  output: string;
};

export async function runLoggedAction(options: {
  title: string;
  action: string;
  stackId?: string;
  isCore?: boolean;
  statusOnSuccess?: "deployed" | "stopped" | "error";
  run: (onOutput: (chunk: string) => void) => Promise<LoggedActionResult>;
}): Promise<LoggedActionResult> {
  const activity = createActivity(options.title);

  const result = await options.run((chunk) =>
    appendOutput(activity.id, chunk)
  );

  finishActivity(activity.id, result.success ? "success" : "error");

  await db.insert(deploymentLogs).values({
    stackId: options.stackId,
    isCore: options.isCore ?? false,
    action: options.action,
    status: result.success ? "success" : "error",
    output: result.output,
  });

  if (result.success && options.statusOnSuccess && options.stackId) {
    const stackId = options.stackId;
    await db
      .update(stacks)
      .set({ status: options.statusOnSuccess, updatedAt: new Date() })
      .where(eq(stacks.id, stackId));
  }

  return result;
}
