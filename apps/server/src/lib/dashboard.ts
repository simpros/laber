import {
  db,
  stacks,
  repositories,
  deploymentLogs,
} from "@laber/db";
import { count, desc, eq } from "drizzle-orm";
import { getCoreSnapshot } from "./core-stack";

export async function getDashboard() {
  // Core stats come from the one shared snapshot. `deployedStacks` counts
  // `stacks.status` for display only — removal never reads it; the column stays while `apps/web` still reads it.
  const [stackCount, repoCount, deployedStacks, recentLogs, core] =
    await Promise.all([
      db.select({ count: count() }).from(stacks),
      db.select({ count: count() }).from(repositories),
      db
        .select({ count: count() })
        .from(stacks)
        .where(eq(stacks.status, "deployed")),
      db
        .select()
        .from(deploymentLogs)
        .orderBy(desc(deploymentLogs.createdAt))
        .limit(10),
      getCoreSnapshot(),
    ]);

  return {
    stats: {
      totalStacks: stackCount[0].count,
      deployedStacks: deployedStacks[0].count,
      repositories: repoCount[0].count,
    },
    coreConfigured: core.configured,
    coreServices: core.services,
    recentLogs,
  };
}
