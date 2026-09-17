import { existsSync } from "fs";
import { dirname, isAbsolute, join, resolve } from "path";

export function findRepoRoot(from: string): string {
  let dir = from;
  while (true) {
    if (existsSync(join(dir, "turbo.json"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return from;
    dir = parent;
  }
}

export function resolveFromRepoRoot(
  pathValue: string,
  from = process.cwd()
) {
  const repoRoot = findRepoRoot(from);
  return isAbsolute(pathValue) ? pathValue : resolve(repoRoot, pathValue);
}

export function resolveDataDir(
  from = process.cwd(),
  dataDir = process.env.DATA_DIR
) {
  const repoRoot = findRepoRoot(from);
  return dataDir
    ? resolveFromRepoRoot(dataDir, from)
    : resolve(repoRoot, "data");
}

export function resolveDatabasePath(
  from = process.cwd(),
  databasePath = process.env.DATABASE_PATH,
  dataDir = process.env.DATA_DIR
) {
  return databasePath
    ? resolveFromRepoRoot(databasePath, from)
    : resolve(resolveDataDir(from, dataDir), "laber.db");
}
