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


// Three-state: null (or omitted) keeps, "" clears, string sets.
export type ConfigValue = string | null;
