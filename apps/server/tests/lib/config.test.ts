import "../setup";
import { TEST_DATA_DIR } from "../setup";
import { describe, it, expect } from "bun:test";
import {
  DATA_DIR,
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

  it("resolves once at import time, alongside the database path", () => {
    expect(getDataDir()).toBe(DATA_DIR);
    expect(getDataDir()).toBe(resolve(TEST_DATA_DIR));
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
