import { resolveDataDir } from "@laber/db/paths";
import { resolve } from "path";

export function getDataDir() {
  return resolveDataDir();
}

export function getRepoDir(repoId: string) {
  return resolve(getDataDir(), "repos", repoId);
}

export function getComposePath(
  repoId: string,
  relativePath: string,
  composeFile: string
) {
  return resolve(getDataDir(), "repos", repoId, relativePath, composeFile);
}

// Three-state: null (or omitted) keeps, "" clears, string sets.
export type ConfigValue = string | null;
