import { fileURLToPath } from "node:url";
import { resolve } from "path";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { db } from "./client";

export function runMigrations() {
  const migrationsFolder = resolve(
    process.env.MIGRATIONS_FOLDER ??
      fileURLToPath(new URL("../drizzle", import.meta.url))
  );

  migrate(db, { migrationsFolder });
}
