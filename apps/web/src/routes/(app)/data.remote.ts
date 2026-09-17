import { query } from "$app/server";
import {
  db,
  stacks,
  repositories,
  deploymentLogs,
  coreConfig,
} from "@laber/db";
import { count, desc, eq } from "drizzle-orm";
import { getCoreStatus } from "$lib/server/core-stack";
import { requireUser } from "$lib/server/auth";

export const getDashboard = query(async () => {
  requireUser();
  const [stackCount] = await db.select({ count: count() }).from(stacks);
  const [repoCount] = await db
    .select({ count: count() })
    .from(repositories);

  const deployedStacks = await db
    .select({ count: count() })
    .from(stacks)
    .where(eq(stacks.status, "deployed"));

  const recentLogs = await db
    .select()
    .from(deploymentLogs)
    .orderBy(desc(deploymentLogs.createdAt))
    .limit(10);

  const coreSettings = await db.select().from(coreConfig);
  const coreConfigured = coreSettings.some((c) => c.key === "ROOT_DOMAIN");

  let coreServices: Awaited<ReturnType<typeof getCoreStatus>> = [];
  try {
    coreServices = await getCoreStatus();
  } catch {
    // Docker not available
  }

  return {
    stats: {
      totalStacks: stackCount.count,
      deployedStacks: deployedStacks[0].count,
      repositories: repoCount.count,
    },
    coreConfigured,
    coreServices,
    recentLogs,
  };
});
