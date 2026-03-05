import { db } from "$lib/server/db";
import { stacks, repositories, stackEnvVars } from "@laber/db";
import { eq, count } from "drizzle-orm";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async () => {
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

  const stacksWithEnvCount = await Promise.all(
    allStacks.map(async (stack) => {
      const [envCount] = await db
        .select({ count: count() })
        .from(stackEnvVars)
        .where(eq(stackEnvVars.stackId, stack.id));
      return { ...stack, envVarCount: envCount.count };
    })
  );

  return { stacks: stacksWithEnvCount };
};
