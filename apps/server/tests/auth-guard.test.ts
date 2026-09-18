import "./setup";
import { describe, it, expect } from "bun:test";
import { app } from "../src/app";
import { req } from "./helpers";

describe("session guard", () => {
  it("returns 401 Unauthorized for unauthenticated API requests", async () => {
    const paths = [
      "/api/dashboard",
      "/api/stacks",
      "/api/stacks/demo",
      "/api/core",
      "/api/repositories",
      "/api/activity/stream",
      "/api/stacks/demo/logs",
    ];
    for (const path of paths) {
      const res = await app.handle(req(path));
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: "Unauthorized" });
    }
  });

  it("returns 401 for unauthenticated POST/PUT/DELETE requests", async () => {
    const cases: Array<[string, string, unknown?]> = [
      ["POST", "/api/stacks/demo/deploy"],
      ["POST", "/api/stacks/demo/stop"],
      ["POST", "/api/stacks/demo/restart"],
      ["POST", "/api/stacks/demo/pull"],
      ["PUT", "/api/stacks/demo/env", { entries: [] }],
      ["PUT", "/api/stacks/demo/secrets", { entries: [] }],
      ["PUT", "/api/stacks/demo/compose", { content: "x" }],
      ["PUT", "/api/core/config", {}],
      ["POST", "/api/core/deploy"],
      ["POST", "/api/core/stop"],
      ["POST", "/api/core/restart"],
      ["POST", "/api/repositories/123/sync"],
      ["DELETE", "/api/repositories/123"],
    ];
    for (const [method, path, body] of cases) {
      const res = await app.handle(
        req(path, {
          method,
          headers: { "content-type": "application/json" },
          body: body === undefined ? undefined : JSON.stringify(body),
        })
      );
      expect(`${method} ${path} -> ${res.status}`).toBe(
        `${method} ${path} -> 401`
      );
      expect(await res.json()).toEqual({ error: "Unauthorized" });
    }
  });

  it("denies unauthenticated malformed requests without running handlers", async () => {
    const res = await app.handle(
      req("/api/repositories", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      })
    );
    expect(res.status).toBe(400);

    const list = await app.handle(
      req("/api/repositories", { headers: { cookie: "none" } })
    );
    expect(list.status).toBe(401);
  });

  it("lets better-auth routes through without a session", async () => {
    const res = await app.handle(req("/api/auth/session"));
    expect(res.status).not.toBe(401);
    expect(await res.text()).not.toContain("Unauthorized");
  });
});
