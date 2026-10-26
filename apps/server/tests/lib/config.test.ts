import "../setup";
import { describe, it, expect } from "bun:test";
import {
  getRepoDir,
  getComposePath,
  getDataDir,
} from "../../src/lib/config";
import { resolve } from "path";

describe("getDataDir", () => {
  it("is defined as a string", () => {
    expect(getDataDir()).toBeDefined();
    expect(typeof getDataDir()).toBe("string");
  });

  it("reflects the configured value instead of the import-time one", () => {
    const before = getDataDir();
    const original = process.env.DATA_DIR;
    process.env.DATA_DIR = resolve(before, "..", "fresh-data-dir");
    try {
      expect(getDataDir()).toBe(resolve(before, "..", "fresh-data-dir"));
      expect(getRepoDir("repo-123")).toBe(
        resolve(getDataDir(), "repos", "repo-123")
      );
    } finally {
      if (original === undefined) delete process.env.DATA_DIR;
      else process.env.DATA_DIR = original;
    }
  });
});

describe("getRepoDir", () => {
  it("returns path under DATA_DIR/repos/{repoId}", () => {
    const result = getRepoDir("repo-123");
    expect(result).toBe(resolve(getDataDir(), "repos", "repo-123"));
  });

  it("handles repo IDs with special characters", () => {
    const result = getRepoDir("my_repo-with.dots");
    expect(result).toBe(
      resolve(getDataDir(), "repos", "my_repo-with.dots")
    );
  });
});

describe("getComposePath", () => {
  it("returns path under DATA_DIR/repos/{repoId}/{relativePath}/{composeFile}", () => {
    const result = getComposePath(
      "repo-1",
      "stacks/app",
      "docker-compose.yaml"
    );
    expect(result).toBe(
      resolve(
        getDataDir(),
        "repos",
        "repo-1",
        "stacks/app",
        "docker-compose.yaml"
      )
    );
  });

  it("handles empty relative path", () => {
    const result = getComposePath("repo-1", "", "compose.yml");
    expect(result).toBe(
      resolve(getDataDir(), "repos", "repo-1", "compose.yml")
    );
  });

  it("handles different compose file names", () => {
    const result = getComposePath("repo-1", "path", "docker-compose.yml");
    expect(result).toBe(
      resolve(
        getDataDir(),
        "repos",
        "repo-1",
        "path",
        "docker-compose.yml"
      )
    );
  });
});
