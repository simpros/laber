import { resolveDataDir } from "@laber/db/paths";
import { resolve } from "path";

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

// `getStackAndRepo` / `assertStackName` live in `stack-context.ts` — import
// from there. This module owns `DATA_DIR` / path builders / `ConfigValue`
// only.

/**
 * Three-state config value shared by every keyed-config write: `null` (or
 * an omitted key) = leave unchanged, `""` = clear, string = set.
 *
 * There is exactly one domain absence (`null`/omitted). `undefined` is only
 * tolerated at the untyped HTTP boundary (`saveCoreConfig` accepts it from
 * the optional Valibot schema) and is never produced by domain code.
 *
 * Stack env/secrets apply it as replace-all (the whole set is rewritten in
 * one transaction); core config applies it as a patch upsert (only the
 * provided keys are touched). The merge vocabulary is the same; only the
 * write scope differs — core stays patch-only so a partial settings form
 * never wipes keys it did not render.
 */
export type ConfigValue = string | null;
