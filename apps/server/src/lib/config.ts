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

// Stack context lives in `stack-context.ts`; this module owns paths and `ConfigValue` only.

/**
 * Three-state config value: `null` (or omitted) = leave unchanged, `""` =
 * clear, string = set. Stack tables apply it as replace-all, core config as patch upsert.
 */
export type ConfigValue = string | null;
