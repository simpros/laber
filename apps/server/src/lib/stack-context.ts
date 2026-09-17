import { db, stacks, repositories } from "@laber/db";
import { eq } from "drizzle-orm";
import { getComposePath } from "./config";
import { NotFoundError, ValidationError } from "./errors";

/**
 * Stack domain context: the primary stack loader plus the stack-name guard.
 * Lives here (not in `config.ts`, which owns `DATA_DIR` / path builders /
 * `ConfigValue`) so mutations import stack context without pulling a
 * grab-bag "config" module for a domain concept.
 */
export async function getStackAndRepo(stackName: string) {
  const [stack] = await db
    .select()
    .from(stacks)
    .where(eq(stacks.name, stackName))
    .limit(1);

  if (!stack) throw new NotFoundError("Stack not found");

  const [repo] = await db
    .select()
    .from(repositories)
    .where(eq(repositories.id, stack.repositoryId))
    .limit(1);

  if (!repo) throw new NotFoundError("Repository not found");

  const composePath = getComposePath(
    repo.id,
    stack.relativePath,
    stack.composeFile
  );

  return { stack, repo, composePath };
}

/** The one stack-name guard. Lives here next to `getStackAndRepo`. */
export function assertStackName(name: string): string {
  if (!name) throw new ValidationError("Stack name must not be empty");
  return name;
}
