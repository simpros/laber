import "./setup";
import { describe, it, expect, beforeAll, afterEach } from "bun:test";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "fs";
import { join } from "path";
import {
  db,
  repositories,
  stacks,
  stackEnvVars,
  stackSecrets,
  deploymentLogs,
} from "@laber/db";
import { eq } from "drizzle-orm";
import { app } from "../src/app";
import { signUp, req, jsonReq } from "./helpers";
import { getRepoDir } from "../src/lib/config";
import { dockerStub, resetDockerStub } from "./docker-stub";

let cookie = "";

beforeAll(async () => {
  ({ cookie } = await signUp());
});

afterEach(() => {
  resetDockerStub();
});

const BASIC_COMPOSE = [
  "services:",
  "  web:",
  "    image: nginx:latest",
  "    environment:",
  "      - FOO=${FOO}",
  "",
].join("\n");

const SECRET_COMPOSE = [
  "services:",
  "  web:",
  "    image: nginx:latest",
  "    environment:",
  "      - FOO=${FOO}",
  "    secrets:",
  "      - mysecret",
  "secrets:",
  "  mysecret:",
  "    file: ./mysecret.txt",
  "",
].join("\n");

async function seedStack(name: string, composeYaml: string) {
  const suffix = name.replace(/[^a-z0-9-]/gi, "");
  const [repo] = await db
    .insert(repositories)
    .values({
      name: `${suffix}-repo`,
      url: "https://example.com/x.git",
      branch: "main",
      stacksPath: "stacks",
    })
    .returning();
  const relativePath = join("stacks", suffix);
  const dir = join(getRepoDir(repo.id), relativePath);
  mkdirSync(dir, { recursive: true });
  const composePath = join(dir, "docker-compose.yaml");
  writeFileSync(composePath, composeYaml, "utf-8");
  const [stack] = await db
    .insert(stacks)
    .values({
      repositoryId: repo.id,
      name,
      relativePath,
      composeFile: "docker-compose.yaml",
    })
    .returning();
  return { repo, stack, composePath };
}

describe("GET /api/stacks", () => {
  it("lists stacks with repo info and env var counts", async () => {
    const { stack } = await seedStack("list-me", BASIC_COMPOSE);
    await db.insert(stackEnvVars).values([
      { stackId: stack.id, key: "A", value: "1", isSecret: false },
      { stackId: stack.id, key: "B", value: "2", isSecret: false },
    ]);

    const res = await app.handle(
      req("/api/stacks", { headers: { cookie } })
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as Array<{
      name: string;
      repoName: string;
      envVarCount: number;
    }>;
    const row = data.find((s) => s.name === "list-me");
    expect(row).toBeDefined();
    expect(row!.repoName).toBe("list-me-repo");
    expect(row!.envVarCount).toBe(2);
  });
});

describe("GET /api/stacks/:name", () => {
  it("returns 404 for an unknown stack", async () => {
    const res = await app.handle(
      req("/api/stacks/no-such-stack", { headers: { cookie } })
    );
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Stack not found");
  });

  it("masks secret values and reports hasValue only", async () => {
    const { stack } = await seedStack("secret-contract", SECRET_COMPOSE);
    await db.insert(stackEnvVars).values({
      stackId: stack.id,
      key: "TOKEN",
      value: "hidden-value",
      isSecret: true,
    });
    await db.insert(stackEnvVars).values({
      stackId: stack.id,
      key: "PLAIN",
      value: "visible",
      isSecret: false,
    });
    await db.insert(stackSecrets).values({
      stackId: stack.id,
      name: "mysecret",
      value: "file-secret-value",
    });

    const res = await app.handle(
      req("/api/stacks/secret-contract", { headers: { cookie } })
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      envVars: Array<{ key: string; value: string; hasValue: boolean }>;
      secrets: Array<{ name: string; hasValue: boolean }>;
      detectedEnvVars: string[];
      composeRaw: string;
      services: Array<{ name: string }>;
    };
    const text = JSON.stringify(data);
    expect(text).not.toContain("hidden-value");
    expect(text).not.toContain("file-secret-value");

    const token = data.envVars.find((e) => e.key === "TOKEN")!;
    expect(token.value).toBe("");
    expect(token.hasValue).toBe(true);
    const plain = data.envVars.find((e) => e.key === "PLAIN")!;
    expect(plain.value).toBe("visible");
    const secret = data.secrets.find((s) => s.name === "mysecret")!;
    expect(secret.hasValue).toBe(true);
    expect(data.detectedEnvVars).toContain("FOO");
    expect(data.services.map((s) => s.name)).toContain("web");
    expect(data.composeRaw).toContain("nginx");
  });
});

describe("POST /api/stacks/:name/deploy", () => {
  it("deploys end to end and writes secret files", async () => {
    const { stack, composePath } = await seedStack(
      "deploy-me",
      SECRET_COMPOSE
    );
    await db.insert(stackEnvVars).values({
      stackId: stack.id,
      key: "FOO",
      value: "bar",
      isSecret: false,
    });
    await db.insert(stackSecrets).values({
      stackId: stack.id,
      name: "mysecret",
      value: "s3cr3t",
    });
    dockerStub.execCompose = async (options) => {
      // Single env channel: stack vars travel via --env-file (there is no
      // second process-env overlay on execCompose anymore).
      const envFlag = options.command.indexOf("--env-file");
      expect(envFlag).toBeGreaterThanOrEqual(0);
      const envContent = readFileSync(options.command[envFlag + 1], "utf-8");
      expect(envContent).toContain("FOO=bar");
      expect(options.projectName).toBe("deploy-me");
      options.onOutput?.("deploying...\n");
      return { stdout: "deployed\n", stderr: "", exitCode: 0 };
    };

    const res = await app.handle(
      jsonReq("/api/stacks/deploy-me/deploy", "POST", {}, cookie)
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      success: boolean;
      output: string;
    };
    expect(body.success).toBe(true);
    expect(body.output).toContain("deployed");

    const [updated] = await db
      .select()
      .from(stacks)
      .where(eq(stacks.id, stack.id));
    expect(updated.status).toBe("deployed");

    const logs = await db
      .select()
      .from(deploymentLogs)
      .where(eq(deploymentLogs.stackId, stack.id));
    expect(logs.some((l) => l.action === "deploy")).toBe(true);

    const secretPath = join(composePath, "..", "mysecret.txt");
    expect(readFileSync(secretPath, "utf-8")).toBe("s3cr3t");
  });

  it("returns 400 when secret values are missing", async () => {
    await seedStack("missing-secret", SECRET_COMPOSE);
    const res = await app.handle(
      jsonReq("/api/stacks/missing-secret/deploy", "POST", {}, cookie)
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("missing values for secret(s): mysecret");
  });

  it("returns 400 when the compose file is broken", async () => {
    const { composePath } = await seedStack(
      "broken-compose",
      BASIC_COMPOSE
    );
    writeFileSync(composePath, "{unclosed: [", "utf-8");
    const res = await app.handle(
      jsonReq("/api/stacks/broken-compose/deploy", "POST", {}, cookie)
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("failed to parse compose file");
  });

  it("returns 404 for an unknown stack", async () => {
    const res = await app.handle(
      jsonReq("/api/stacks/no-such-stack/deploy", "POST", {}, cookie)
    );
    expect(res.status).toBe(404);
  });

  it("returns 500 when the deploy command fails", async () => {
    const { stack } = await seedStack("failed-deploy", BASIC_COMPOSE);
    dockerStub.execCompose = async () => ({
      stdout: "",
      stderr: "boom",
      exitCode: 1,
    });

    const res = await app.handle(
      jsonReq("/api/stacks/failed-deploy/deploy", "POST", {}, cookie)
    );
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string };
    // Short failure contract: the wire message stays short; the full
    // transcript lives in the deployment log and activity stream.
    expect(body.error).toContain("Deploying failed-deploy failed");
    expect(body.error).not.toContain("boom");

    const logs = await db
      .select()
      .from(deploymentLogs)
      .where(eq(deploymentLogs.stackId, stack.id));
    expect(logs.some((l) => (l.output ?? "").includes("boom"))).toBe(true);
  });

  it("removes written secret files when the deploy fails", async () => {
    const { stack, composePath } = await seedStack(
      "failed-secret-deploy",
      SECRET_COMPOSE
    );
    await db.insert(stackEnvVars).values({
      stackId: stack.id,
      key: "FOO",
      value: "bar",
      isSecret: false,
    });
    await db.insert(stackSecrets).values({
      stackId: stack.id,
      name: "mysecret",
      value: "s3cr3t",
    });

    dockerStub.execCompose = async () => ({
      stdout: "",
      stderr: "compose blew up",
      exitCode: 1,
    });

    const res = await app.handle(
      jsonReq(
        "/api/stacks/failed-secret-deploy/deploy",
        "POST",
        {},
        cookie
      )
    );
    expect(res.status).toBe(500);

    const secretPath = join(composePath, "..", "mysecret.txt");
    expect(existsSync(secretPath)).toBe(false);
  });
});

describe("POST /api/stacks/:name/stop|restart|pull", () => {
  it("stops a stack and marks it stopped", async () => {
    const { stack } = await seedStack("stop-me", BASIC_COMPOSE);
    await db
      .update(stacks)
      .set({ status: "deployed" })
      .where(eq(stacks.id, stack.id));
    dockerStub.runComposeCommand = async () => ({
      success: true,
      output: "stopped",
    });

    const res = await app.handle(
      jsonReq("/api/stacks/stop-me/stop", "POST", {}, cookie)
    );
    expect(res.status).toBe(200);
    expect(((await res.json()) as { success: boolean }).success).toBe(
      true
    );
    const [updated] = await db
      .select()
      .from(stacks)
      .where(eq(stacks.id, stack.id));
    expect(updated.status).toBe("stopped");
  });

  it("returns 500 when stopping fails", async () => {
    const { stack } = await seedStack("unstoppable", BASIC_COMPOSE);
    dockerStub.runComposeCommand = async () => ({
      success: false,
      output: "down blew up",
    });

    const res = await app.handle(
      jsonReq("/api/stacks/unstoppable/stop", "POST", {}, cookie)
    );
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("Stopping unstoppable failed");
    expect(body.error).not.toContain("down blew up");

    const logs = await db
      .select()
      .from(deploymentLogs)
      .where(eq(deploymentLogs.stackId, stack.id));
    expect(logs.some((l) => (l.output ?? "").includes("down blew up"))).toBe(
      true
    );
  });

  it("restarts and pulls without changing status", async () => {
    await seedStack("bounce-me", BASIC_COMPOSE);
    for (const action of ["restart", "pull"] as const) {
      const res = await app.handle(
        jsonReq(`/api/stacks/bounce-me/${action}`, "POST", {}, cookie)
      );
      expect(res.status).toBe(200);
      expect(((await res.json()) as { success: boolean }).success).toBe(
        true
      );
    }
  });

  it("returns 404 for unknown stacks", async () => {
    for (const action of ["stop", "restart", "pull"] as const) {
      const res = await app.handle(
        jsonReq(`/api/stacks/no-such-stack/${action}`, "POST", {}, cookie)
      );
      expect(res.status).toBe(404);
    }
  });
});

describe("PUT /api/stacks/:name/env", () => {
  it("saves entries, keeps null values unchanged, validates shape", async () => {
    const { stack } = await seedStack("env-save", BASIC_COMPOSE);
    await db.insert(stackEnvVars).values({
      stackId: stack.id,
      key: "KEEP",
      value: "keep-me",
      isSecret: false,
    });

    const putRes = await app.handle(
      jsonReq(
        "/api/stacks/env-save/env",
        "PUT",
        {
          entries: [
            { key: "KEEP", value: null, isSecret: false },
            { key: "NEW", value: "n", isSecret: true },
          ],
        },
        cookie
      )
    );
    expect(putRes.status).toBe(200);

    const getRes = await app.handle(
      req("/api/stacks/env-save", { headers: { cookie } })
    );
    const data = (await getRes.json()) as {
      envVars: Array<{ key: string; value: string; hasValue: boolean }>;
    };
    const keep = data.envVars.find((e) => e.key === "KEEP")!;
    expect(keep.value).toBe("keep-me");
    const added = data.envVars.find((e) => e.key === "NEW")!;
    expect(added.value).toBe("");
    expect(added.hasValue).toBe(true);

    const bad = await app.handle(
      jsonReq(
        "/api/stacks/env-save/env",
        "PUT",
        { entries: "nope" },
        cookie
      )
    );
    expect(bad.status).toBe(400);
  });
});

describe("PUT /api/stacks/:name/secrets", () => {
  it("saves secret entries and keeps null values unchanged", async () => {
    const { stack } = await seedStack("secrets-save", SECRET_COMPOSE);
    await db.insert(stackSecrets).values({
      stackId: stack.id,
      name: "mysecret",
      value: "original",
    });

    const putRes = await app.handle(
      jsonReq(
        "/api/stacks/secrets-save/secrets",
        "PUT",
        { entries: [{ name: "mysecret", value: null }] },
        cookie
      )
    );
    expect(putRes.status).toBe(200);

    const rows = await db
      .select()
      .from(stackSecrets)
      .where(eq(stackSecrets.stackId, stack.id));
    expect(rows.find((r) => r.name === "mysecret")?.value).toBe(
      "original"
    );

    await app.handle(
      jsonReq(
        "/api/stacks/secrets-save/secrets",
        "PUT",
        { entries: [{ name: "mysecret", value: "rotated" }] },
        cookie
      )
    );
    const rows2 = await db
      .select()
      .from(stackSecrets)
      .where(eq(stackSecrets.stackId, stack.id));
    expect(rows2.find((r) => r.name === "mysecret")?.value).toBe(
      "rotated"
    );
  });
});

describe("PUT /api/stacks/:name/compose", () => {
  it("writes valid compose content and rejects invalid input", async () => {
    const { composePath } = await seedStack("compose-save", BASIC_COMPOSE);

    const updated = BASIC_COMPOSE.replace("nginx:latest", "nginx:stable");
    const ok = await app.handle(
      jsonReq(
        "/api/stacks/compose-save/compose",
        "PUT",
        { content: updated },
        cookie
      )
    );
    expect(ok.status).toBe(200);
    expect(readFileSync(composePath, "utf-8")).toContain("nginx:stable");

    const detail = (await (
      await app.handle(
        req("/api/stacks/compose-save", { headers: { cookie } })
      )
    ).json()) as { composeRaw: string };
    expect(detail.composeRaw).toContain("nginx:stable");

    const empty = await app.handle(
      jsonReq(
        "/api/stacks/compose-save/compose",
        "PUT",
        { content: "" },
        cookie
      )
    );
    expect(empty.status).toBe(400);

    const garbage = await app.handle(
      jsonReq(
        "/api/stacks/compose-save/compose",
        "PUT",
        { content: "{unclosed: [" },
        cookie
      )
    );
    expect(garbage.status).toBe(400);

    const noServices = await app.handle(
      jsonReq(
        "/api/stacks/compose-save/compose",
        "PUT",
        { content: "version: '3'\n" },
        cookie
      )
    );
    expect(noServices.status).toBe(400);

    const missing = await app.handle(
      jsonReq(
        "/api/stacks/no-such-stack/compose",
        "PUT",
        { content: updated },
        cookie
      )
    );
    expect(missing.status).toBe(404);
  });
});
