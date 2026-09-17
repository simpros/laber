import {
  db,
  stacks,
  repositories,
  deploymentLogs,
  coreConfig,
} from "@laber/db";
import { count, desc, eq } from "drizzle-orm";
import { safeCoreStatus, isCoreConfiguredRows } from "./core-stack";

export async function getDashboard() {
  // Independent aggregates, fetched together.
  const [
    stackCount,
    repoCount,
    deployedStacks,
    recentLogs,
    coreSettings,
    coreServices,
  ] = await Promise.all([
    db.select({ count: count() }).from(stacks),
    db.select({ count: count() }).from(repositories),
    db.select({ count: count() }).from(stacks).where(eq(stacks.status, "deployed")),
    db
      .select()
      .from(deploymentLogs)
      .orderBy(desc(deploymentLogs.createdAt))
      .limit(10),
    db.select().from(coreConfig),
    safeCoreStatus(),
  ]);

  return {
    stats: {
      totalStacks: stackCount[0].count,
      deployedStacks: deployedStacks[0].count,
      repositories: repoCount[0].count,
    },
    coreConfigured: isCoreConfiguredRows(coreSettings),
    coreServices,
    recentLogs,
  };
}
