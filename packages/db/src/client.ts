import { drizzle } from "drizzle-orm/bun-sqlite";
import { resolve, dirname } from "path";
import { mkdirSync } from "fs";
import { relations } from "./index";

const dbPath = resolve(process.env.DATABASE_PATH ?? "./data/laber.db");
mkdirSync(dirname(dbPath), { recursive: true });

export const db = drizzle(dbPath, { relations });
db.$client.run("PRAGMA journal_mode = WAL");
db.$client.run("PRAGMA foreign_keys = ON");

export type Db = typeof db;
