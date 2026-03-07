import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, rmSync } from "fs";
import { join, resolve } from "path";
import { tmpdir } from "os";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { fileURLToPath } from "node:url";
import { relations } from "./relations";
import {
  repositories,
  stacks,
  stackEnvVars,
  stackSecrets,
  coreConfig,
  deploymentLogs,
  user,
  session,
} from "./schema";

type TestDb = ReturnType<typeof drizzle>;
let db: TestDb;
let tmpDir: string;

const runIntegration = process.env.INTEGRATION === "1";

if (runIntegration) {
  describe("SQLite database (integration)", () => {
    beforeAll(() => {
      tmpDir = mkdtempSync(join(tmpdir(), "laber-db-integration-"));

      const dbPath = join(tmpDir, "test.db");
      db = drizzle(dbPath, { relations });
      db.$client.run("PRAGMA journal_mode = WAL");
      db.$client.run("PRAGMA foreign_keys = ON");

      const migrationsFolder = resolve(
        fileURLToPath(new URL("../drizzle", import.meta.url))
      );
      migrate(db, { migrationsFolder });
    });

    afterAll(() => {
      if (db) db.$client.close();
      if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
    });

    describe("repositories CRUD", () => {
      it("inserts and retrieves a repository", () => {
        const [repo] = db
          .insert(repositories)
          .values({
            id: "repo-1",
            name: "test-repo",
            url: "git@github.com:test/repo.git",
            branch: "main",
            stacksPath: "stacks",
            createdAt: new Date(),
            updatedAt: new Date(),
          })
          .returning()
          .all();

        expect(repo.id).toBe("repo-1");
        expect(repo.name).toBe("test-repo");
        expect(repo.url).toBe("git@github.com:test/repo.git");

        const fetched = db
          .select()
          .from(repositories)
          .where(eq(repositories.id, "repo-1"))
          .all();
        expect(fetched).toHaveLength(1);
        expect(fetched[0].name).toBe("test-repo");
      });

      it("updates a repository", () => {
        db.update(repositories)
          .set({ name: "renamed-repo", updatedAt: new Date() })
          .where(eq(repositories.id, "repo-1"))
          .run();

        const [updated] = db
          .select()
          .from(repositories)
          .where(eq(repositories.id, "repo-1"))
          .all();
        expect(updated.name).toBe("renamed-repo");
      });
    });

    describe("stacks CRUD", () => {
      it("inserts a stack linked to a repository", () => {
        const [stack] = db
          .insert(stacks)
          .values({
            id: "stack-1",
            repositoryId: "repo-1",
            name: "traefik",
            relativePath: "stacks/traefik",
            composeFile: "docker-compose.yaml",
            status: "discovered",
            createdAt: new Date(),
            updatedAt: new Date(),
          })
          .returning()
          .all();

        expect(stack.name).toBe("traefik");
        expect(stack.repositoryId).toBe("repo-1");
        expect(stack.status).toBe("discovered");
      });

      it("updates stack status", () => {
        db.update(stacks)
          .set({ status: "deployed", updatedAt: new Date() })
          .where(eq(stacks.id, "stack-1"))
          .run();

        const [updated] = db
          .select()
          .from(stacks)
          .where(eq(stacks.id, "stack-1"))
          .all();
        expect(updated.status).toBe("deployed");
      });
    });

    describe("stack env vars", () => {
      it("inserts env vars for a stack", () => {
        db.insert(stackEnvVars)
          .values([
            {
              id: "env-1",
              stackId: "stack-1",
              key: "DOMAIN",
              value: "example.com",
              isSecret: false,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
            {
              id: "env-2",
              stackId: "stack-1",
              key: "API_KEY",
              value: "secret-key",
              isSecret: true,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ])
          .run();

        const envs = db
          .select()
          .from(stackEnvVars)
          .where(eq(stackEnvVars.stackId, "stack-1"))
          .all();
        expect(envs).toHaveLength(2);
        expect(envs.find((e) => e.key === "API_KEY")?.isSecret).toBe(true);
      });
    });

    describe("stack secrets", () => {
      it("inserts secrets for a stack", () => {
        const [secret] = db
          .insert(stackSecrets)
          .values({
            id: "secret-1",
            stackId: "stack-1",
            name: "db_password",
            value: "super-secret",
            createdAt: new Date(),
            updatedAt: new Date(),
          })
          .returning()
          .all();

        expect(secret.name).toBe("db_password");
        expect(secret.value).toBe("super-secret");
      });
    });

    describe("core config", () => {
      it("inserts and retrieves config entries", () => {
        db.insert(coreConfig)
          .values([
            {
              id: "cfg-1",
              key: "CLOUDFLARE_ZONE_ID",
              value: "zone-123",
              isSecret: false,
              updatedAt: new Date(),
            },
            {
              id: "cfg-2",
              key: "CLOUDFLARE_API_TOKEN",
              value: "token-abc",
              isSecret: true,
              updatedAt: new Date(),
            },
          ])
          .run();

        const configs = db.select().from(coreConfig).all();
        expect(configs).toHaveLength(2);
        expect(configs.find((c) => c.key === "CLOUDFLARE_API_TOKEN")?.isSecret).toBe(true);
      });

      it("enforces unique key constraint", () => {
        expect(() => {
          db.insert(coreConfig)
            .values({
              id: "cfg-dup",
              key: "CLOUDFLARE_ZONE_ID",
              value: "duplicate",
              updatedAt: new Date(),
            })
            .run();
        }).toThrow();
      });
    });

    describe("deployment logs", () => {
      it("inserts logs linked to a stack", () => {
        const [log] = db
          .insert(deploymentLogs)
          .values({
            id: "log-1",
            stackId: "stack-1",
            action: "deploy",
            status: "success",
            output: "Container started",
            createdAt: new Date(),
          })
          .returning()
          .all();

        expect(log.action).toBe("deploy");
        expect(log.status).toBe("success");
      });

      it("inserts core logs without stack reference", () => {
        const [log] = db
          .insert(deploymentLogs)
          .values({
            id: "log-2",
            isCore: true,
            action: "setup",
            status: "running",
            createdAt: new Date(),
          })
          .returning()
          .all();

        expect(log.isCore).toBe(true);
        expect(log.stackId).toBeNull();
      });
    });

    describe("foreign key constraints", () => {
      it("rejects stack with non-existent repository", () => {
        expect(() => {
          db.insert(stacks)
            .values({
              id: "stack-orphan",
              repositoryId: "non-existent-repo",
              name: "orphan",
              relativePath: "stacks/orphan",
              createdAt: new Date(),
              updatedAt: new Date(),
            })
            .run();
        }).toThrow();
      });

      it("rejects env var with non-existent stack", () => {
        expect(() => {
          db.insert(stackEnvVars)
            .values({
              id: "env-orphan",
              stackId: "non-existent-stack",
              key: "FOO",
              value: "bar",
              createdAt: new Date(),
              updatedAt: new Date(),
            })
            .run();
        }).toThrow();
      });
    });

    describe("cascade deletes", () => {
      it("deleting a repository cascades to stacks, env vars, and secrets", () => {
        const stacksBefore = db
          .select()
          .from(stacks)
          .where(eq(stacks.repositoryId, "repo-1"))
          .all();
        expect(stacksBefore.length).toBeGreaterThan(0);

        db.delete(repositories).where(eq(repositories.id, "repo-1")).run();

        const stacksAfter = db
          .select()
          .from(stacks)
          .where(eq(stacks.repositoryId, "repo-1"))
          .all();
        expect(stacksAfter).toHaveLength(0);

        const envVars = db
          .select()
          .from(stackEnvVars)
          .where(eq(stackEnvVars.stackId, "stack-1"))
          .all();
        expect(envVars).toHaveLength(0);

        const secrets = db
          .select()
          .from(stackSecrets)
          .where(eq(stackSecrets.stackId, "stack-1"))
          .all();
        expect(secrets).toHaveLength(0);
      });

      it("deleting a stack sets deployment log stack_id to null", () => {
        db.insert(repositories)
          .values({
            id: "repo-2",
            name: "cascade-test",
            url: "git@github.com:test/cascade.git",
            createdAt: new Date(),
            updatedAt: new Date(),
          })
          .run();

        db.insert(stacks)
          .values({
            id: "stack-2",
            repositoryId: "repo-2",
            name: "log-cascade-test",
            relativePath: "stacks/test",
            createdAt: new Date(),
            updatedAt: new Date(),
          })
          .run();

        db.insert(deploymentLogs)
          .values({
            id: "log-3",
            stackId: "stack-2",
            action: "deploy",
            status: "success",
            createdAt: new Date(),
          })
          .run();

        db.delete(stacks).where(eq(stacks.id, "stack-2")).run();

        const [log] = db
          .select()
          .from(deploymentLogs)
          .where(eq(deploymentLogs.id, "log-3"))
          .all();
        expect(log.stackId).toBeNull();
      });
    });

    describe("auth tables", () => {
      it("inserts a user and session with cascade delete", () => {
        const now = new Date();
        db.insert(user)
          .values({
            id: "user-1",
            name: "Test User",
            email: "test@example.com",
            emailVerified: true,
            createdAt: now,
            updatedAt: now,
          })
          .run();

        db.insert(session)
          .values({
            id: "sess-1",
            token: "test-token-123",
            userId: "user-1",
            expiresAt: new Date(Date.now() + 86400000),
            createdAt: now,
            updatedAt: now,
          })
          .run();

        const sessions = db
          .select()
          .from(session)
          .where(eq(session.userId, "user-1"))
          .all();
        expect(sessions).toHaveLength(1);

        db.delete(user).where(eq(user.id, "user-1")).run();

        const sessionsAfter = db
          .select()
          .from(session)
          .where(eq(session.userId, "user-1"))
          .all();
        expect(sessionsAfter).toHaveLength(0);
      });
    });

    describe("WAL mode", () => {
      it("confirms WAL journal mode is active", () => {
        const result = db.all<{ journal_mode: string }>(
          sql`PRAGMA journal_mode`
        );
        expect(result[0].journal_mode).toBe("wal");
      });

      it("confirms foreign keys are enabled", () => {
        const result = db.all<{ foreign_keys: number }>(
          sql`PRAGMA foreign_keys`
        );
        expect(result[0].foreign_keys).toBe(1);
      });
    });
  });
}
