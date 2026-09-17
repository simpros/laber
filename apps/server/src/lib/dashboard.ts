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
  // `deployedStacks` counts the `stacks.status` column for display only:
  // removal (sync/delete) never reads that column — the fail-closed Docker
  // probe is the only gate — so this number is UI/history, not a safety
  // input. The column stays (rather than being deleted) because the frozen
  // SvelteKit tree in `apps/web` still reads/writes it until its deletion
  // ticket; the server treats it as paint, never as ground truth.
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
