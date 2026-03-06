import { drizzle } from "drizzle-orm/bun-sqlite";
import { resolve, dirname, join } from "path";
import { mkdirSync, existsSync } from "fs";
import { relations } from "./relations";

function findRepoRoot(from: string): string {
  let dir = from;
  while (dir !== dirname(dir)) {
    if (existsSync(join(dir, "turbo.json"))) return dir;
    dir = dirname(dir);
  }
  return from;
}

const dbPath = process.env.DATABASE_PATH
  ? resolve(process.env.DATABASE_PATH)
  : resolve(findRepoRoot(process.cwd()), "data/laber.db");
mkdirSync(dirname(dbPath), { recursive: true });

export const db = drizzle(dbPath, { relations });
db.$client.run("PRAGMA journal_mode = WAL");
db.$client.run("PRAGMA foreign_keys = ON");

export type Db = typeof db;
