import { db, stacks, repositories } from "@laber/db";
import { resolveDataDir } from "@laber/db/paths";
import { eq } from "drizzle-orm";
import { resolve } from "path";
import { NotFoundError, ValidationError } from "./errors";

export const DATA_DIR = resolveDataDir();

export function getRepoDir(repoId: string) {
  return resolve(DATA_DIR, "repos", repoId);
}

export function getComposePath(
  repoId: string,
  relativePath: string,
  composeFile: string
) {
  return resolve(DATA_DIR, "repos", repoId, relativePath, composeFile);
}

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
 * Three-state config value shared by every keyed-config write:
 * `undefined`/`null` = leave unchanged, `""` = clear, string = set.
 *
 * Stack env/secrets apply it as replace-all (the whole set is rewritten in
 * one transaction); core config applies it as a patch upsert (only the
 * provided keys are touched). The merge vocabulary is the same; only the
 * write scope differs — core stays patch-only so a partial settings form
 * never wipes keys it did not render.
 */
export type ConfigValue = string | null | undefined;
