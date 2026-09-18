import { describe, it, expect } from "bun:test";
import { createApiClient } from "../src/index";

function stubFetch(
  calls: Array<{ url: unknown; init: unknown }>,
  body: unknown,
  status = 200
): typeof fetch {
  return (async (input: unknown, init?: unknown) => {
    calls.push({ url: input, init });
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
}

describe("createApiClient", () => {
  it("calls the dashboard endpoint and returns parsed data", async () => {
    const calls: Array<{ url: unknown; init: unknown }> = [];
    const dashboard = {
      stats: { totalStacks: 1, deployedStacks: 0, repositories: 0 },
      coreConfigured: false,
      coreServices: [],
      recentLogs: [],
    };
    const client = createApiClient("http://localhost:3001", {
      fetcher: stubFetch(calls, dashboard),
    });

    const res = await client.api.dashboard.get();
    expect(res.error).toBeNull();
    expect(res.data).toEqual(dashboard);
    expect(calls).toHaveLength(1);
    expect(String(calls[0].url)).toContain("/api/dashboard");
  });

  it("forwards cookies for session auth", async () => {
    const calls: Array<{ url: unknown; init: unknown }> = [];
    const client = createApiClient("http://localhost:3001", {
      headers: { cookie: "better-auth.session_token=abc123" },
      fetcher: stubFetch(calls, { repositories: [], stacks: [] }),
    });

    await client.api.repositories.get();
    expect(calls).toHaveLength(1);
    const initHeaders = (calls[0].init as RequestInit).headers;
    const headers =
      initHeaders instanceof Headers
        ? initHeaders
        : new Headers(initHeaders as Record<string, string>);
    expect(headers.get("cookie")).toContain(
      "better-auth.session_token=abc123"
    );
  });

  it("sends stack commands with path params", async () => {
    const calls: Array<{ url: unknown; init: unknown }> = [];
    const client = createApiClient("http://localhost:3001", {
      fetcher: stubFetch(calls, { success: true, output: "mocked" }),
    });

    const res = await client.api.stacks({ name: "demo" }).deploy.post();
    expect(res.error).toBeNull();
    expect(calls).toHaveLength(1);
    expect(String(calls[0].url)).toContain("/api/stacks/demo/deploy");
    expect((calls[0].init as RequestInit).method).toBe("POST");
  });

  it("sends env updates with a typed body", async () => {
    const calls: Array<{ url: unknown; init: unknown }> = [];
    const client = createApiClient("http://localhost:3001", {
      fetcher: stubFetch(calls, { success: true }),
    });

    const res = await client.api.stacks({ name: "demo" }).env.put({
      entries: [{ key: "FOO", value: null, isSecret: false }],
    });
    expect(res.error).toBeNull();
    expect(String(calls[0].url)).toContain("/api/stacks/demo/env");
  });

  it("rejects mistyped bodies at compile time", async () => {
    const calls: Array<{ url: unknown; init: unknown }> = [];
    const client = createApiClient("http://localhost:3001", {
      fetcher: stubFetch(calls, { success: true }),
    });

    // @ts-expect-error - entries requires key/value/isSecret entries
    await client.api.stacks({ name: "demo" }).env.put({ wrong: true });
  });
});
