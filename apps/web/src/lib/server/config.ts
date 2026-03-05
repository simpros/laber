import { resolve } from "path";
import { getDb } from "$lib/server/db";
import { stacks, repositories } from "@laber/db";
import { eq } from "drizzle-orm";
import { error } from "@sveltejs/kit";

export const DATA_DIR = process.env.DATA_DIR ?? "./data";

export function getRepoDir(repoId: string) {
  return resolve(DATA_DIR, "repos", repoId);
}

export function getComposePath(
  repoId: string,
  relativePath: string,
  composeFile: string,
) {
  return resolve(DATA_DIR, "repos", repoId, relativePath, composeFile);
}

export async function getStackAndRepo(stackName: string) {
  const db = getDb();
  const [stack] = await db
    .select()
    .from(stacks)
    .where(eq(stacks.name, stackName))
    .limit(1);

  if (!stack) error(404, "Stack not found");

  const [repo] = await db
    .select()
    .from(repositories)
    .where(eq(repositories.id, stack.repositoryId))
    .limit(1);

  if (!repo) error(404, "Repository not found");

  const composePath = getComposePath(
    repo.id,
    stack.relativePath,
    stack.composeFile,
  );

  return { stack, repo, composePath };
}
