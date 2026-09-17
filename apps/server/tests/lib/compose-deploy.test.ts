import "../setup";
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  extractNetworkName,
  extractSecrets,
  parseDeployContent,
  readDeployFile,
} from "../../src/lib/compose-deploy";
import { ValidationError } from "../../src/lib/errors";

describe("extractNetworkName", () => {
  it("returns undefined when no networks defined", () => {
    const compose = { services: {} };
    expect(extractNetworkName(compose)).toBeUndefined();
  });

  it("returns external network name", () => {
    const compose = {
      services: {},
      networks: {
        main: { name: "main", external: true },
      },
    };
    expect(extractNetworkName(compose)).toBe("main");
  });

  it("returns undefined for non-external networks", () => {
    const compose = {
      services: {},
      networks: {
        internal: { name: "internal" },
      },
    };
    expect(extractNetworkName(compose)).toBeUndefined();
  });

  it("returns default external network name", () => {
    const compose = {
      services: {},
      networks: {
        default: { name: "shared-net", external: true },
      },
    };
    expect(extractNetworkName(compose)).toBe("shared-net");
  });
});

describe("extractSecrets", () => {
  const COMPOSE_PATH = "/data/repos/abc/stacks/myapp/docker-compose.yaml";

  it("returns empty array when no secrets defined", () => {
    const compose = { services: {} };
    expect(extractSecrets(compose, COMPOSE_PATH)).toEqual([]);
  });

  it("extracts file-based secrets", () => {
    const compose = {
      services: {
        web: { secrets: ["db_password"] },
      },
      secrets: {
        db_password: { file: "./secrets/db_password.txt" },
      },
    };
    const result = extractSecrets(compose, COMPOSE_PATH);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("db_password");
    expect(result[0].filePath).toBe(
      "/data/repos/abc/stacks/myapp/secrets/db_password.txt"
    );
    expect(result[0].services).toEqual(["web"]);
  });

  it("maps secrets to multiple services", () => {
    const compose = {
      services: {
        web: { secrets: ["shared_key"] },
        worker: { secrets: ["shared_key"] },
      },
      secrets: {
        shared_key: { file: "./secrets/key.txt" },
      },
    };
    const result = extractSecrets(compose, COMPOSE_PATH);
    expect(result[0].services).toEqual(["web", "worker"]);
  });

  it("skips external secrets (no file)", () => {
    const compose = {
      services: {
        web: { secrets: ["ext_secret"] },
      },
      secrets: {
        ext_secret: { external: true },
      },
    };
    const result = extractSecrets(compose, COMPOSE_PATH);
    expect(result).toHaveLength(0);
  });

  it("handles secrets not used by any service", () => {
    const compose = {
      services: { web: {} },
      secrets: {
        unused: { file: "./secrets/unused.txt" },
      },
    };
    const result = extractSecrets(compose, COMPOSE_PATH);
    expect(result).toHaveLength(1);
    expect(result[0].services).toEqual([]);
  });

  it("resolves relative secret paths against the compose directory", () => {
    const compose = {
      services: {
        web: { secrets: ["db_password"] },
      },
      secrets: {
        db_password: { file: "./secrets/db_password.txt" },
      },
    };
    const result = extractSecrets(
      compose,
      "/data/repos/abc/stacks/myapp/docker-compose.yaml"
    );
    expect(result[0].filePath).toBe(
      "/data/repos/abc/stacks/myapp/secrets/db_password.txt"
    );
  });

  it("keeps absolute secret paths as-is when resolving", () => {
    const compose = {
      services: {
        web: { secrets: ["db_password"] },
      },
      secrets: {
        db_password: { file: "/run/secrets/db_password" },
      },
    };
    const result = extractSecrets(
      compose,
      "/data/repos/abc/stacks/myapp/docker-compose.yaml"
    );
    expect(result[0].filePath).toBe("/run/secrets/db_password");
  });
});

describe("parseDeployContent", () => {
  it("parses a valid compose document", () => {
    const compose = parseDeployContent(
      "services:\n  web:\n    image: nginx:latest\n"
    );
    expect(Object.keys(compose.services)).toEqual(["web"]);
    expect(compose.services.web.image).toBe("nginx:latest");
  });

  it("rejects YAML syntax errors", () => {
    expect(() => parseDeployContent("{unclosed: [")).toThrow(
      ValidationError
    );
  });

  it("rejects documents without a services section", () => {
    expect(() => parseDeployContent("version: '3'\n")).toThrow(
      "missing 'services' section"
    );
  });

  it("rejects non-object services", () => {
    expect(() => parseDeployContent("services: just-a-string\n")).toThrow(
      ValidationError
    );
  });

  it("rejects non-object service entries", () => {
    expect(() =>
      parseDeployContent("services:\n  web: just-a-string\n")
    ).toThrow(ValidationError);
  });

  it("tolerates exotic but valid shapes (numeric ports, extension fields)", () => {
    const compose = parseDeployContent(
      [
        "services:",
        "  web:",
        "    image: nginx:latest",
        "    ports:",
        "      - 8080",
        "    x-custom:",
        "      anything: true",
        "",
      ].join("\n")
    );
    expect(compose.services.web.image).toBe("nginx:latest");
  });
});

describe("readDeployFile", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "laber-deploy-test-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("parses networks and secrets from a single read", () => {
    const content = [
      "services:",
      "  web:",
      "    image: nginx:latest",
      "networks:",
      "  proxy:",
      "    name: traefik-net",
      "    external: true",
      "",
    ].join("\n");
    const filePath = join(tempDir, "docker-compose.yaml");
    writeFileSync(filePath, content, "utf-8");

    const doc = readDeployFile(filePath);
    expect(doc.services.web.image).toBe("nginx:latest");
    expect(extractNetworkName(doc)).toBe("traefik-net");
  });

  it("throws a ValidationError for a missing services section", () => {
    const filePath = join(tempDir, "docker-compose.yaml");
    writeFileSync(filePath, "version: '3'\n", "utf-8");

    expect(() => readDeployFile(filePath)).toThrow(ValidationError);
  });
});
