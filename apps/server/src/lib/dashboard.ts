import {
  db,
  stacks,
  repositories,
  deploymentLogs,
} from "@laber/db";
import { count, desc, eq } from "drizzle-orm";
import { getCoreSnapshot } from "./core-stack";

export async function getDashboard() {
  // Independent aggregates, fetched together. "Configured + services" comes
  // from the one shared core snapshot — never a second assembly.
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
