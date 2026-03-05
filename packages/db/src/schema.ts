import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { nanoid } from "nanoid";

// ============================================================================
// Auth tables (managed by better-auth via drizzle adapter)
// ============================================================================

export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" })
    .notNull()
    .default(false),
  image: text("image"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const session = sqliteTable("session", {
  id: text("id").primaryKey(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  token: text("token").notNull().unique(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id),
});

export const account = sqliteTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: integer("access_token_expires_at", {
    mode: "timestamp",
  }),
  refreshTokenExpiresAt: integer("refresh_token_expires_at", {
    mode: "timestamp",
  }),
  scope: text("scope"),
  password: text("password"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const verification = sqliteTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }),
  updatedAt: integer("updated_at", { mode: "timestamp" }),
});

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
  composeFile: text("compose_file").notNull().default("docker-compose.yaml"),
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
  isSecret: integer("is_secret", { mode: "boolean" }).notNull().default(false),
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
  isSecret: integer("is_secret", { mode: "boolean" }).notNull().default(false),
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
