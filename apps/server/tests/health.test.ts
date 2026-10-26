import "./setup";
import { describe, expect, it } from "bun:test";
import { app } from "../src/app";
import { req } from "./helpers";

describe("GET /health", () => {
  it("responds ok without auth", async () => {
    const res = await app.handle(req("/health"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });
});
