import "./setup";
import { describe, it, expect, beforeAll } from "bun:test";
import { app } from "../src/app";
import { signUp, req } from "./helpers";

let cookie = "";

beforeAll(async () => {
  ({ cookie } = await signUp());
});

describe("GET /api/activity/stream", () => {
  it("opens an SSE stream with a connected comment", async () => {
    const res = await app.handle(
      req("/api/activity/stream", { headers: { cookie } })
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let text = "";
    // The server sends ": connected" immediately on subscribe.
    while (!text.includes("connected")) {
      const { done, value } = await reader.read();
      if (done) break;
      text += decoder.decode(value, { stream: true });
    }
    await reader.cancel();
    expect(text).toContain(": connected");
  });
});
