import { defineConfig } from "drizzle-kit";
import { resolveDatabasePath } from "./src/paths";

const dbPath = resolveDatabasePath();

export default defineConfig({
  schema: "./src/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: dbPath,
  },
});
