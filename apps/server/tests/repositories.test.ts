import "./setup";
import { describe, it, expect, beforeAll, afterEach } from "bun:test";
import { execFileSync } from "child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { db, repositories, stacks } from "@laber/db";
import { eq } from "drizzle-orm";
import { app } from "../src/app";
import { signUp, req, jsonReq } from "./helpers";
import { dockerStub, resetDockerStub } from "./docker-stub";

let cookie = "";

beforeAll(async () => {
  ({ cookie } = await signUp());
});

afterEach(() => {
  resetDockerStub();
});

const fixtures: string[] = [];

function initFixtureRepo(stackNames: string[]): string {
  const dir = mkdtempSync(join(tmpdir(), "laber-fixture-"));
  fixtures.push(dir);
  execFileSync("git", ["init", "-b", "main"], { cwd: dir });
  for (const name of stackNames) {
    const stackDir = join(dir, "stacks", name);
    mkdirSync(stackDir, { recursive: true });
    writeFileSync(
      join(stackDir, "docker-compose.yaml"),
      `services:\n  web:\n    image: nginx:latest\n`
    );
  }
  execFileSync("git", ["add", "."], { cwd: dir });
  execFileSync(
    "git",
    [
      "-c",
      "user.email=test@example.com",
      "-c",
      "user.name=Test",
      "commit",
      "-m",
      "init",
    ],
    { cwd: dir }
  );
  return dir;
}

describe("repositories", () => {
  it("lists repositories and stacks", async () => {
    const res = await app.handle(
      req("/api/repositories", { headers: { cookie } })
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      repositories: unknown[];
      stacks: unknown[];
    };
    expect(Array.isArray(data.repositories)).toBe(true);
    expect(Array.isArray(data.stacks)).toBe(true);
  });

  it("rejects invalid input", async () => {
    const res = await app.handle(
      jsonReq("/api/repositories", "POST", { name: "", url: "" }, cookie)
    );
    expect(res.status).toBe(400);
  });

  it("adds, syncs and removes a repository end to end", async () => {
    const fixtureDir = initFixtureRepo(["demo"]);

    const addRes = await app.handle(
      jsonReq(
        "/api/repositories",
        "POST",
        {
          name: "fixture",
          url: fixtureDir,
          branch: "main",
          stacksPath: "stacks",
        },
        cookie
      )
    );
    expect(addRes.status).toBe(201);
    expect(
      ((await addRes.json()) as { discovered: number }).discovered
    ).toBe(1);

    const list = (await (
      await app.handle(req("/api/repositories", { headers: { cookie } }))
    ).json()) as {
      repositories: Array<{ id: string; name: string }>;
      stacks: Array<{ name: string }>;
    };
    const repo = list.repositories.find((r) => r.name === "fixture")!;
    expect(repo).toBeDefined();
    expect(list.stacks.map((s) => s.name)).toContain("demo");

    // Add a second stack to the fixture and sync.
    const second = join(fixtureDir, "stacks", "second");
    mkdirSync(second, { recursive: true });
    writeFileSync(
      join(second, "docker-compose.yaml"),
      `services:\n  web:\n    image: nginx:latest\n`
    );
    execFileSync("git", ["add", "."], { cwd: fixtureDir });
    execFileSync(
      "git",
      [
        "-c",
        "user.email=test@example.com",
        "-c",
        "user.name=Test",
        "commit",
        "-m",
        "second",
      ],
      { cwd: fixtureDir }
    );

    const syncRes = await app.handle(
      jsonReq(`/api/repositories/${repo.id}/sync`, "POST", {}, cookie)
    );
    expect(syncRes.status).toBe(200);
    const syncBody = (await syncRes.json()) as {
      newStacks: number;
      updatedStacks: number;
      removedStacks: string[];
    };
    expect(syncBody.newStacks).toBe(1);

    const delRes = await app.handle(
      req(`/api/repositories/${repo.id}`, {
        method: "DELETE",
        headers: { cookie },
      })
    );
    expect(delRes.status).toBe(200);
    const remaining = await db
      .select()
      .from(repositories)
      .where(eq(repositories.id, repo.id));
    expect(remaining).toHaveLength(0);

    rmSync(fixtureDir, { recursive: true, force: true });
  });

  it("returns 404 for unknown repositories", async () => {
    const sync = await app.handle(
      jsonReq("/api/repositories/does-not-exist/sync", "POST", {}, cookie)
    );
    expect(sync.status).toBe(404);
    const del = await app.handle(
      req("/api/repositories/does-not-exist", {
        method: "DELETE",
        headers: { cookie },
      })
    );
    expect(del.status).toBe(404);
  });

  it("brings deployed stacks down instead of refusing the delete", async () => {
    const fixtureDir = initFixtureRepo(["doomed"]);

    const addRes = await app.handle(
      jsonReq(
        "/api/repositories",
        "POST",
        {
          name: "doomed-fixture",
          url: fixtureDir,
          branch: "main",
          stacksPath: "stacks",
        },
        cookie
      )
    );
    expect(addRes.status).toBe(201);

    const list = (await (
      await app.handle(req("/api/repositories", { headers: { cookie } }))
    ).json()) as {
      repositories: Array<{ id: string; name: string }>;
    };
    const repo = list.repositories.find((r) => r.name === "doomed-fixture")!;
    const repoStacks = await db
      .select()
      .from(stacks)
      .where(eq(stacks.repositoryId, repo.id));
    expect(repoStacks).toHaveLength(1);
    await db
      .update(stacks)
      .set({ status: "deployed" })
      .where(eq(stacks.id, repoStacks[0].id));

    // Delete is down-first: `down` is the gate, not the status column.
    const downs: string[][] = [];
    dockerStub.listContainers = async () => [];
    dockerStub.runComposeCommand = async (
      _composePath,
      command,
      _projectName,
      _onOutput
    ) => {
      downs.push(command);
      return { output: "down" };
    };

    const delRes = await app.handle(
      req(`/api/repositories/${repo.id}`, {
        method: "DELETE",
        headers: { cookie },
      })
    );
    expect(delRes.status).toBe(200);
    expect(downs).toEqual([["down"]]);

    const remaining = await db
      .select()
      .from(repositories)
      .where(eq(repositories.id, repo.id));
    expect(remaining).toHaveLength(0);

    rmSync(fixtureDir, { recursive: true, force: true });
  });

  it("returns 500 when cloning fails", async () => {
    const res = await app.handle(
      jsonReq(
        "/api/repositories",
        "POST",
        { name: "broken", url: "/nonexistent/path-xyz" },
        cookie
      )
    );
    expect(res.status).toBe(500);
  });

  it("brings live containers down instead of refusing on a stale status", async () => {
    const fixtureDir = initFixtureRepo(["stale"]);
    const addRes = await app.handle(
      jsonReq(
        "/api/repositories",
        "POST",
        {
          name: "stale-fixture",
          url: fixtureDir,
          branch: "main",
          stacksPath: "stacks",
        },
        cookie
      )
    );
    expect(addRes.status).toBe(201);

    const list = (await (
      await app.handle(req("/api/repositories", { headers: { cookie } }))
    ).json()) as {
      repositories: Array<{ id: string; name: string }>;
    };
    const repo = list.repositories.find((r) => r.name === "stale-fixture")!;
    const repoStacks = await db
      .select()
      .from(stacks)
      .where(eq(stacks.repositoryId, repo.id));
    // Stale column says stopped, but Docker still runs the project: the
    // hard `down` (not a probe refuse) is what protects the containers.
    await db
      .update(stacks)
      .set({ status: "stopped" })
      .where(eq(stacks.id, repoStacks[0].id));
    dockerStub.listContainers = async () => [
      {
        id: "abc",
        name: "stale-web-1",
        image: "nginx:latest",
        state: "running",
        status: "Up",
        ports: [],
        labels: {},
        networks: [],
        createdAt: new Date().toISOString(),
      },
    ];
    const downs: string[][] = [];
    dockerStub.runComposeCommand = async (
      _composePath,
      command,
      _projectName,
      _onOutput
    ) => {
      downs.push(command);
      return { output: "down" };
    };

    const delRes = await app.handle(
      req(`/api/repositories/${repo.id}`, {
        method: "DELETE",
        headers: { cookie },
      })
    );
    expect(delRes.status).toBe(200);
    expect(downs).toEqual([["down"]]);

    const remaining = await db
      .select()
      .from(repositories)
      .where(eq(repositories.id, repo.id));
    expect(remaining).toHaveLength(0);

    rmSync(fixtureDir, { recursive: true, force: true });
  });

  it("refuses to sync away a still-deployed stack", async () => {
    const fixtureDir = initFixtureRepo(["guarded"]);
    const addRes = await app.handle(
      jsonReq(
        "/api/repositories",
        "POST",
        {
          name: "guarded-fixture",
          url: fixtureDir,
          branch: "main",
          stacksPath: "stacks",
        },
        cookie
      )
    );
    expect(addRes.status).toBe(201);

    const list = (await (
      await app.handle(req("/api/repositories", { headers: { cookie } }))
    ).json()) as {
      repositories: Array<{ id: string; name: string }>;
    };
    const repo = list.repositories.find((r) => r.name === "guarded-fixture")!;
    const repoStacks = await db
      .select()
      .from(stacks)
      .where(eq(stacks.repositoryId, repo.id));
    await db
      .update(stacks)
      .set({ status: "deployed" })
      .where(eq(stacks.id, repoStacks[0].id));

    // The stack disappears from the git tree while still deployed.
    rmSync(join(fixtureDir, "stacks", "guarded"), {
      recursive: true,
      force: true,
    });
    execFileSync("git", ["add", "-A"], { cwd: fixtureDir });
    execFileSync(
      "git",
      [
        "-c",
        "user.email=test@example.com",
        "-c",
        "user.name=Test",
        "commit",
        "-m",
        "remove guarded",
      ],
      { cwd: fixtureDir }
    );

    const syncRes = await app.handle(
      jsonReq(`/api/repositories/${repo.id}/sync`, "POST", {}, cookie)
    );
    expect(syncRes.status).toBe(409);

    // Nothing reconciled away: the row survives the refused sync.
    const remaining = await db
      .select()
      .from(stacks)
      .where(eq(stacks.repositoryId, repo.id));
    expect(remaining).toHaveLength(1);

    rmSync(fixtureDir, { recursive: true, force: true });
  });

  it("refuses to sync away a stack with live containers even if status is stale", async () => {
    const fixtureDir = initFixtureRepo(["live"]);
    const addRes = await app.handle(
      jsonReq(
        "/api/repositories",
        "POST",
        {
          name: "live-fixture",
          url: fixtureDir,
          branch: "main",
          stacksPath: "stacks",
        },
        cookie
      )
    );
    expect(addRes.status).toBe(201);

    const list = (await (
      await app.handle(req("/api/repositories", { headers: { cookie } }))
    ).json()) as {
      repositories: Array<{ id: string; name: string }>;
    };
    const repo = list.repositories.find((r) => r.name === "live-fixture")!;
    const repoStacks = await db
      .select()
      .from(stacks)
      .where(eq(stacks.repositoryId, repo.id));
    // Stale column says stopped, but Docker still runs the project.
    await db
      .update(stacks)
      .set({ status: "stopped" })
      .where(eq(stacks.id, repoStacks[0].id));
    dockerStub.listContainers = async () => [
      {
        id: "abc",
        name: "live-web-1",
        image: "nginx:latest",
        state: "running",
        status: "Up",
        ports: [],
        labels: {},
        networks: [],
        createdAt: new Date().toISOString(),
      },
    ];

    rmSync(join(fixtureDir, "stacks", "live"), {
      recursive: true,
      force: true,
    });
    execFileSync("git", ["add", "-A"], { cwd: fixtureDir });
    execFileSync(
      "git",
      [
        "-c",
        "user.email=test@example.com",
        "-c",
        "user.name=Test",
        "commit",
        "-m",
        "remove live",
      ],
      { cwd: fixtureDir }
    );

    const syncRes = await app.handle(
      jsonReq(`/api/repositories/${repo.id}/sync`, "POST", {}, cookie)
    );
    expect(syncRes.status).toBe(409);

    const remaining = await db
      .select()
      .from(stacks)
      .where(eq(stacks.repositoryId, repo.id));
    expect(remaining).toHaveLength(1);

    rmSync(fixtureDir, { recursive: true, force: true });
  });

  it("fails hard without deleting rows when bringing a stack down fails", async () => {
    const fixtureDir = initFixtureRepo(["stubborn"]);
    const addRes = await app.handle(
      jsonReq(
        "/api/repositories",
        "POST",
        {
          name: "stubborn-fixture",
          url: fixtureDir,
          branch: "main",
          stacksPath: "stacks",
        },
        cookie
      )
    );
    expect(addRes.status).toBe(201);

    const list = (await (
      await app.handle(req("/api/repositories", { headers: { cookie } }))
    ).json()) as {
      repositories: Array<{ id: string; name: string }>;
    };
    const repo = list.repositories.find(
      (r) => r.name === "stubborn-fixture"
    )!;
    dockerStub.listContainers = async () => [];
    dockerStub.runComposeCommand = async () => {
      throw new Error("down blew up");
    };

    const delRes = await app.handle(
      req(`/api/repositories/${repo.id}`, {
        method: "DELETE",
        headers: { cookie },
      })
    );
    expect(delRes.status).toBe(500);

    // Docker first, hard: the failed `down` aborts before any DB change.
    const remaining = await db
      .select()
      .from(repositories)
      .where(eq(repositories.id, repo.id));
    expect(remaining).toHaveLength(1);
    const remainingStacks = await db
      .select()
      .from(stacks)
      .where(eq(stacks.repositoryId, repo.id));
    expect(remainingStacks).toHaveLength(1);

    rmSync(fixtureDir, { recursive: true, force: true });
  });
});
