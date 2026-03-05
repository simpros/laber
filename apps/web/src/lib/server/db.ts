import { createDb, migrateDb, type Db } from "@laber/db";
import { resolve, dirname } from "path";
import { mkdirSync } from "fs";

let _db: Db | null = null;

export function getDb(): Db {
  if (!_db) {
    const raw = process.env.DATABASE_PATH ?? "./data/laber.db";
    const dbPath = resolve(raw);
    mkdirSync(dirname(dbPath), { recursive: true });
    _db = createDb(dbPath);

    const migrationsFolder = resolve(
      process.env.MIGRATIONS_FOLDER ??
        (process.env.NODE_ENV === "production"
          ? "server/drizzle"
          : "../../packages/db/drizzle"),
    );
    migrateDb(_db, migrationsFolder);
  }
  return _db;
}

export const db = new Proxy({} as Db, {
  get(_target, prop, receiver) {
    return Reflect.get(getDb(), prop, receiver);
  },
});
