import { describe, it, expect } from "bun:test";
import { getRepoDir, getComposePath, DATA_DIR } from "./config";
import { resolve } from "path";

describe("DATA_DIR", () => {
  it("is defined as a string", () => {
    expect(DATA_DIR).toBeDefined();
    expect(typeof DATA_DIR).toBe("string");
  });
});

describe("getRepoDir", () => {
  it("returns path under DATA_DIR/repos/{repoId}", () => {
    const result = getRepoDir("repo-123");
    expect(result).toBe(resolve(DATA_DIR, "repos", "repo-123"));
  });

  it("handles repo IDs with special characters", () => {
    const result = getRepoDir("my_repo-with.dots");
    expect(result).toBe(resolve(DATA_DIR, "repos", "my_repo-with.dots"));
  });
});

describe("getComposePath", () => {
  it("returns path under DATA_DIR/repos/{repoId}/{relativePath}/{composeFile}", () => {
    const result = getComposePath("repo-1", "stacks/app", "docker-compose.yaml");
    expect(result).toBe(
      resolve(DATA_DIR, "repos", "repo-1", "stacks/app", "docker-compose.yaml")
    );
  });

  it("handles empty relative path", () => {
    const result = getComposePath("repo-1", "", "compose.yml");
    expect(result).toBe(resolve(DATA_DIR, "repos", "repo-1", "compose.yml"));
  });

  it("handles different compose file names", () => {
    const result = getComposePath("repo-1", "path", "docker-compose.yml");
    expect(result).toBe(
      resolve(DATA_DIR, "repos", "repo-1", "path", "docker-compose.yml")
    );
  });
});
