import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import * as schema from "./schema";

export function createDb(path: string) {
  const db = drizzle(path, { schema });
  db.$client.run("PRAGMA journal_mode = WAL");
  db.$client.run("PRAGMA foreign_keys = ON");
  return db;
}

export function migrateDb(db: Db, migrationsFolder: string) {
  migrate(db, { migrationsFolder });
}

export type Db = ReturnType<typeof createDb>;

export * from "./schema";
