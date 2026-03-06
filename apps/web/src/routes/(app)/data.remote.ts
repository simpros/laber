import { query } from "$app/server";
import {
  db,
  stacks,
  repositories,
  deploymentLogs,
  coreConfig,
} from "@laber/db";
import { count, desc, eq } from "drizzle-orm";
import { getContainersByLabel } from "$lib/server/docker";

export const getDashboard = query(async () => {
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

  let coreServices: Array<{
    name: string;
    state: string;
    status: string;
    image: string;
  }> = [];
  try {
    const containers = await getContainersByLabel(
      "com.docker.compose.project",
      "laber-core",
    );
    coreServices = containers.map((c) => ({
      name: c.name,
      state: c.state,
      status: c.status,
      image: c.image,
    }));
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
