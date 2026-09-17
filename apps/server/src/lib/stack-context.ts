import { db, stacks, repositories } from "@laber/db";
import { eq } from "drizzle-orm";
import { getComposePath } from "./config";
import { NotFoundError, ValidationError } from "./errors";
import { withRepoLock } from "./repo-lock";

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

/**
 * The one lock choreography for stack-scoped mutations: sample the lock key
 * cheaply outside, then re-resolve identity + compose path *under* the lock
 * so a sync that deletes the row between the two reads 404s instead of
 * mutating an orphan project. Deploy, stop, and compose save are call sites,
 * not policy owners — sample + mutate share one mutex, one helper.
 */
export async function withLockedStack<T>(
  name: string,
  fn: (ctx: { stack: Awaited<ReturnType<typeof getStackAndRepo>>["stack"]; composePath: string }) => Promise<T>
): Promise<T> {
  assertStackName(name);
  const { stack: pre } = await getStackAndRepo(name);
  return withRepoLock(pre.repositoryId, async () => {
    const { stack, composePath } = await getStackAndRepo(name);
    return fn({ stack, composePath });
  });
}
