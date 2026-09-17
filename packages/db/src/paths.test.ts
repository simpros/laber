import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "laber-paths-test-"));
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

describe("findRepoRoot", () => {
  it("finds directory containing turbo.json", async () => {
    writeFileSync(join(tempDir, "turbo.json"), "{}");
    const nested = join(tempDir, "a", "b", "c");
    mkdirSync(nested, { recursive: true });

    const { findRepoRoot } = await import("./paths");
    expect(findRepoRoot(nested)).toBe(tempDir);
  });

  it("returns starting directory when turbo.json is not found", async () => {
    const nested = join(tempDir, "no-turbo");
    mkdirSync(nested, { recursive: true });

    const { findRepoRoot } = await import("./paths");
    const result = findRepoRoot(nested);
    expect(result).toBe(nested);
  });

  it("finds turbo.json in the starting directory itself", async () => {
    writeFileSync(join(tempDir, "turbo.json"), "{}");

    const { findRepoRoot } = await import("./paths");
    expect(findRepoRoot(tempDir)).toBe(tempDir);
  });
});

describe("resolveFromRepoRoot", () => {
  it("resolves relative path from repo root", async () => {
    writeFileSync(join(tempDir, "turbo.json"), "{}");

    const { resolveFromRepoRoot } = await import("./paths");
    const result = resolveFromRepoRoot("data/test.db", tempDir);
    expect(result).toBe(join(tempDir, "data/test.db"));
  });

  it("returns absolute paths unchanged", async () => {
    const { resolveFromRepoRoot } = await import("./paths");
    const absPath = "/absolute/path/to/file";
    expect(resolveFromRepoRoot(absPath, tempDir)).toBe(absPath);
  });
});

describe("resolveDataDir", () => {
  it("uses DATA_DIR env when provided", async () => {
    writeFileSync(join(tempDir, "turbo.json"), "{}");

    const { resolveDataDir } = await import("./paths");
    const result = resolveDataDir(tempDir, "/custom/data");
    expect(result).toBe("/custom/data");
  });

  it("falls back to data/ under repo root", async () => {
    writeFileSync(join(tempDir, "turbo.json"), "{}");

    const { resolveDataDir } = await import("./paths");
    const result = resolveDataDir(tempDir, undefined);
    expect(result).toBe(join(tempDir, "data"));
  });

  it("resolves relative DATA_DIR from repo root", async () => {
    writeFileSync(join(tempDir, "turbo.json"), "{}");

    const { resolveDataDir } = await import("./paths");
    const result = resolveDataDir(tempDir, "custom-data");
    expect(result).toBe(join(tempDir, "custom-data"));
  });
});

describe("resolveDatabasePath", () => {
  it("uses DATABASE_PATH when provided", async () => {
    const { resolveDatabasePath } = await import("./paths");
    const result = resolveDatabasePath(tempDir, "/custom/db.sqlite");
    expect(result).toBe("/custom/db.sqlite");
  });

  it("falls back to laber.db in data dir", async () => {
    writeFileSync(join(tempDir, "turbo.json"), "{}");

    const { resolveDatabasePath } = await import("./paths");
    const result = resolveDatabasePath(tempDir, undefined, undefined);
    expect(result).toBe(join(tempDir, "data", "laber.db"));
  });

  it("uses custom data dir for database path", async () => {
    writeFileSync(join(tempDir, "turbo.json"), "{}");

    const { resolveDatabasePath } = await import("./paths");
    const result = resolveDatabasePath(tempDir, undefined, "/custom/data");
    expect(result).toBe(join("/custom/data", "laber.db"));
  });
});
