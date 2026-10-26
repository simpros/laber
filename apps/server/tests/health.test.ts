import "./setup";
import { describe, expect, it } from "bun:test";
import { db } from "@laber/db";
import { app } from "../src/app";
import { req } from "./helpers";

describe("GET /health", () => {
  it("responds ok without auth", async () => {
    const res = await app.handle(req("/health"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });

  it("responds 503 when the database is unusable", async () => {
    const select = db.select;
    db.select = (() => {
      throw new Error("boom");
    }) as typeof db.select;
    try {
      const res = await app.handle(req("/health"));
      expect(res.status).toBe(503);
      expect(await res.json()).toEqual({ status: "error" });
    } finally {
      db.select = select;
    }
    const res = await app.handle(req("/health"));
    expect(res.status).toBe(200);
  });
});
