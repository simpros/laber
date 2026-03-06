import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { nanoid } from "nanoid";

// ============================================================================
// Auth tables (managed by better-auth via drizzle adapter)
// ============================================================================

export * from "./auth-schema";

// ============================================================================
// Application tables
// ============================================================================

export const repositories = sqliteTable("repositories", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => nanoid()),
  name: text("name").notNull(),
  url: text("url").notNull(),
  branch: text("branch").notNull().default("main"),
  sshPrivateKey: text("ssh_private_key"),
  stacksPath: text("stacks_path").notNull().default("stacks"),
  lastSyncedAt: integer("last_synced_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const stacks = sqliteTable("stacks", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => nanoid()),
  repositoryId: text("repository_id")
    .notNull()
    .references(() => repositories.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  relativePath: text("relative_path").notNull(),
  composeFile: text("compose_file")
    .notNull()
    .default("docker-compose.yaml"),
  status: text("status", {
    enum: ["discovered", "deployed", "stopped", "error"],
  })
    .notNull()
    .default("discovered"),
  networkName: text("network_name"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const stackEnvVars = sqliteTable("stack_env_vars", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => nanoid()),
  stackId: text("stack_id")
    .notNull()
    .references(() => stacks.id, { onDelete: "cascade" }),
  key: text("key").notNull(),
  value: text("value").notNull(),
  isSecret: integer("is_secret", { mode: "boolean" })
    .notNull()
    .default(false),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const coreConfig = sqliteTable("core_config", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => nanoid()),
  key: text("key").notNull().unique(),
  value: text("value").notNull(),
  isSecret: integer("is_secret", { mode: "boolean" })
    .notNull()
    .default(false),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const deploymentLogs = sqliteTable("deployment_logs", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => nanoid()),
  stackId: text("stack_id").references(() => stacks.id, {
    onDelete: "set null",
  }),
  isCore: integer("is_core", { mode: "boolean" }).notNull().default(false),
  action: text("action").notNull(),
  status: text("status", { enum: ["running", "success", "error"] })
    .notNull()
    .default("running"),
  output: text("output"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});
