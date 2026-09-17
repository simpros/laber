import "./setup";
import { describe, it, expect, beforeAll } from "bun:test";
import { db, repositories, stacks, deploymentLogs } from "@laber/db";
import { app } from "../src/app";
import { signUp, req } from "./helpers";

let cookie = "";

beforeAll(async () => {
  ({ cookie } = await signUp());
});

describe("GET /api/dashboard", () => {
  it("returns stats, core state and recent logs", async () => {
    const [repo] = await db
      .insert(repositories)
      .values({ name: "dash-repo", url: "https://example.com/d.git" })
      .returning();
    const [stack] = await db
      .insert(stacks)
      .values({
        repositoryId: repo.id,
        name: "dash-stack",
        relativePath: "stacks/dash-stack",
        composeFile: "docker-compose.yaml",
        status: "deployed",
      })
      .returning();
    await db.insert(deploymentLogs).values({
      stackId: stack.id,
      action: "deploy",
      status: "success",
      output: "ok",
    });

    const res = await app.handle(
      req("/api/dashboard", { headers: { cookie } })
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      stats: {
        totalStacks: number;
        deployedStacks: number;
        repositories: number;
      };
      coreConfigured: boolean;
      coreServices: unknown[];
      recentLogs: Array<{ output: string }>;
    };
    expect(data.stats.totalStacks).toBeGreaterThanOrEqual(1);
    expect(data.stats.deployedStacks).toBeGreaterThanOrEqual(1);
    expect(data.stats.repositories).toBeGreaterThanOrEqual(1);
    expect(typeof data.coreConfigured).toBe("boolean");
    expect(Array.isArray(data.coreServices)).toBe(true);
    expect(data.recentLogs.some((l) => l.output === "ok")).toBe(true);
  });
});
