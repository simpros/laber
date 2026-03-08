import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { discoverStacks } from "./git";

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "laber-git-test-"));
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

describe("discoverStacks", () => {
  it("returns empty array for empty directory", async () => {
    mkdirSync(join(tempDir, "stacks"));
    const result = await discoverStacks(tempDir, "stacks");
    expect(result).toEqual([]);
  });

  it("returns empty array when stacks path does not exist", async () => {
    const result = await discoverStacks(tempDir, "nonexistent");
    expect(result).toEqual([]);
  });

  it("discovers stack with docker-compose.yaml", async () => {
    const stackDir = join(tempDir, "stacks", "myapp");
    mkdirSync(stackDir, { recursive: true });
    writeFileSync(
      join(stackDir, "docker-compose.yaml"),
      "services:\n  web:\n    image: nginx:latest\n"
    );

    const result = await discoverStacks(tempDir, "stacks");
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("myapp");
    expect(result[0].relativePath).toBe(join("stacks", "myapp"));
    expect(result[0].composeFile).toBe("docker-compose.yaml");
  });

  it("discovers stack with docker-compose.yml", async () => {
    const stackDir = join(tempDir, "stacks", "myapp");
    mkdirSync(stackDir, { recursive: true });
    writeFileSync(
      join(stackDir, "docker-compose.yml"),
      "services:\n  web:\n    image: nginx:latest\n"
    );

    const result = await discoverStacks(tempDir, "stacks");
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("myapp");
    expect(result[0].composeFile).toBe("docker-compose.yml");
  });

  it("prefers .yaml over .yml when both exist", async () => {
    const stackDir = join(tempDir, "stacks", "myapp");
    mkdirSync(stackDir, { recursive: true });
    writeFileSync(
      join(stackDir, "docker-compose.yaml"),
      "services:\n  web:\n    image: nginx:latest\n"
    );
    writeFileSync(
      join(stackDir, "docker-compose.yml"),
      "services:\n  web:\n    image: nginx:latest\n"
    );

    const result = await discoverStacks(tempDir, "stacks");
    expect(result).toHaveLength(1);
    expect(result[0].composeFile).toBe("docker-compose.yaml");
  });

  it("ignores non-directory entries in the stacks path", async () => {
    mkdirSync(join(tempDir, "stacks"), { recursive: true });
    writeFileSync(join(tempDir, "stacks", "README.md"), "# Stacks");
    writeFileSync(join(tempDir, "stacks", "config.yaml"), "key: value");

    const result = await discoverStacks(tempDir, "stacks");
    expect(result).toEqual([]);
  });

  it("extracts network name from compose file with external network", async () => {
    const stackDir = join(tempDir, "stacks", "myapp");
    mkdirSync(stackDir, { recursive: true });
    writeFileSync(
      join(stackDir, "docker-compose.yaml"),
      [
        "services:",
        "  web:",
        "    image: nginx:latest",
        "networks:",
        "  proxy:",
        "    name: traefik-net",
        "    external: true",
      ].join("\n")
    );

    const result = await discoverStacks(tempDir, "stacks");
    expect(result).toHaveLength(1);
    expect(result[0].networkName).toBe("traefik-net");
  });

  it("returns null networkName when no external networks", async () => {
    const stackDir = join(tempDir, "stacks", "myapp");
    mkdirSync(stackDir, { recursive: true });
    writeFileSync(
      join(stackDir, "docker-compose.yaml"),
      "services:\n  web:\n    image: nginx:latest\n"
    );

    const result = await discoverStacks(tempDir, "stacks");
    expect(result).toHaveLength(1);
    expect(result[0].networkName).toBeNull();
  });

  it("skips subdirectories without compose files", async () => {
    const stacksDir = join(tempDir, "stacks");
    mkdirSync(join(stacksDir, "valid-app"), { recursive: true });
    mkdirSync(join(stacksDir, "no-compose"), { recursive: true });
    writeFileSync(
      join(stacksDir, "valid-app", "docker-compose.yaml"),
      "services:\n  web:\n    image: nginx:latest\n"
    );
    writeFileSync(
      join(stacksDir, "no-compose", "README.md"),
      "# No compose here"
    );

    const result = await discoverStacks(tempDir, "stacks");
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("valid-app");
  });

  it("discovers multiple stacks", async () => {
    const stacksDir = join(tempDir, "stacks");
    for (const name of ["app-a", "app-b", "app-c"]) {
      mkdirSync(join(stacksDir, name), { recursive: true });
      writeFileSync(
        join(stacksDir, name, "docker-compose.yaml"),
        "services:\n  web:\n    image: nginx:latest\n"
      );
    }

    const result = await discoverStacks(tempDir, "stacks");
    expect(result).toHaveLength(3);
    const names = result.map((s) => s.name).sort();
    expect(names).toEqual(["app-a", "app-b", "app-c"]);
  });
});
