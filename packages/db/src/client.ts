import { mkdirSync } from "fs";
import { dirname } from "path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { resolveDatabasePath } from "./paths";
import { relations } from "./relations";

const dbPath = resolveDatabasePath();
mkdirSync(dirname(dbPath), { recursive: true });

export const db = drizzle(dbPath, { relations });
db.$client.run("PRAGMA journal_mode = WAL");
db.$client.run("PRAGMA foreign_keys = ON");

export type Db = typeof db;
