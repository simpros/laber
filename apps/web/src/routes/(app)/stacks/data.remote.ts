import { query } from "$app/server";
import { db, stacks, repositories, stackEnvVars } from "@laber/db";
import { eq, count } from "drizzle-orm";
import { requireUser } from "$lib/server/auth";

export const getStacks = query(async () => {
  requireUser();
  const allStacks = await db
    .select({
      id: stacks.id,
      name: stacks.name,
      status: stacks.status,
      relativePath: stacks.relativePath,
      composeFile: stacks.composeFile,
      networkName: stacks.networkName,
      repositoryId: stacks.repositoryId,
      createdAt: stacks.createdAt,
      updatedAt: stacks.updatedAt,
      repoName: repositories.name,
      repoUrl: repositories.url,
    })
    .from(stacks)
    .leftJoin(repositories, eq(stacks.repositoryId, repositories.id));

  const envCounts = await db
    .select({ stackId: stackEnvVars.stackId, count: count() })
    .from(stackEnvVars)
    .groupBy(stackEnvVars.stackId);
  const countByStackId = new Map(
    envCounts.map((r) => [r.stackId, r.count])
  );

  return allStacks.map((stack) => ({
    ...stack,
    envVarCount: countByStackId.get(stack.id) ?? 0,
  }));
});
