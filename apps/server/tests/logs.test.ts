import "./setup";
import { describe, it, expect, beforeAll, afterEach } from "bun:test";
import type { ContainerInfo } from "../src/lib/types";
import { app } from "../src/app";
import { signUp, req } from "./helpers";
import { dockerStub, resetDockerStub } from "./docker-stub";

let cookie = "";

beforeAll(async () => {
  ({ cookie } = await signUp());
});

afterEach(() => {
  resetDockerStub();
});

const fakeContainer = {
  id: "abc123",
  name: "demo-web-1",
  image: "nginx:latest",
  state: "running",
  status: "Up 5 minutes",
  ports: [],
  labels: {},
  networks: [],
  createdAt: new Date().toISOString(),
} as ContainerInfo;

describe("GET /api/stacks/:name/logs", () => {
  it("returns 404 when the stack has no containers", async () => {
    dockerStub.listContainers = async () => [];
    const res = await app.handle(
      req("/api/stacks/anything/logs", { headers: { cookie } })
    );
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("No containers found for this stack");
  });

  it("returns container logs as JSON", async () => {
    dockerStub.listContainers = async () => [fakeContainer];
    dockerStub.getContainerLogs = async ({ containerId, tail }) => {
      expect(containerId).toBe("abc123");
      expect(tail).toBe(50);
      return "line1\nline2\n";
    };
    const res = await app.handle(
      req("/api/stacks/demo/logs?tail=50", { headers: { cookie } })
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { logs: string };
    expect(body.logs).toBe("line1\nline2\n");
  });

  it("streams logs as SSE when follow=true", async () => {
    dockerStub.listContainers = async () => [fakeContainer];
    dockerStub.followContainerLogs = async () =>
      new ReadableStream<string>({
        start(controller) {
          controller.enqueue("hello ");
          controller.enqueue("world\n");
          controller.close();
        },
      });
    const res = await app.handle(
      req("/api/stacks/demo/logs?follow=true", { headers: { cookie } })
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const text = await res.text();
    expect(text).toContain('data: "hello "');
    expect(text).toContain('data: "world\\n"');
  });
});
