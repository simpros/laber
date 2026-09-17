import "../setup";
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  parseComposeDocument,
  loadComposeDocument,
} from "../../src/lib/compose-parse";
import { extractNetworkName } from "../../src/lib/compose-services";
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

describe("parseComposeDocument secret refs (via the one gate)", () => {
  const COMPOSE_PATH = "/data/repos/abc/stacks/myapp/docker-compose.yaml";

  it("returns empty array when no secrets defined", () => {
    const { secrets } = parseComposeDocument("services: {}\n", COMPOSE_PATH);
    expect(secrets).toEqual([]);
  });

  it("extracts file-based secrets", () => {
    const content = [
      "services:",
      "  web:",
      "    image: nginx:latest",
      "    secrets:",
      "      - db_password",
      "secrets:",
      "  db_password:",
      "    file: ./secrets/db_password.txt",
      "",
    ].join("\n");
    const { secrets: result } = parseComposeDocument(content, COMPOSE_PATH);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("db_password");
    expect(result[0].filePath).toBe(
      "/data/repos/abc/stacks/myapp/secrets/db_password.txt"
    );
    expect(result[0].services).toEqual(["web"]);
  });

  it("maps secrets to multiple services", () => {
    const content = [
      "services:",
      "  web:",
      "    image: nginx:latest",
      "    secrets:",
      "      - shared_key",
      "  worker:",
      "    image: nginx:latest",
      "    secrets:",
      "      - shared_key",
      "secrets:",
      "  shared_key:",
      "    file: ./secrets/key.txt",
      "",
    ].join("\n");
    const { secrets: result } = parseComposeDocument(content, COMPOSE_PATH);
    expect(result[0].services).toEqual(["web", "worker"]);
  });

  it("skips external secrets (no file)", () => {
    const content = [
      "services:",
      "  web:",
      "    image: nginx:latest",
      "    secrets:",
      "      - ext_secret",
      "secrets:",
      "  ext_secret:",
      "    external: true",
      "",
    ].join("\n");
    const { secrets: result } = parseComposeDocument(content, COMPOSE_PATH);
    expect(result).toHaveLength(0);
  });

  it("rejects long-form service secret references", () => {
    // Long-form shapes fail at the parse gate (schema), not in the
    // extractor: there are no unparsed production callers.
    const content = [
      "services:",
      "  web:",
      "    image: nginx:latest",
      "    secrets:",
      "      - source: db_password",
      "secrets:",
      "  db_password:",
      "    file: ./secrets/db_password.txt",
      "",
    ].join("\n");
    // Skipping these would deploy without files the compose file intended.
    expect(() => parseComposeDocument(content, COMPOSE_PATH)).toThrow(
      ValidationError
    );
  });

  it("rejects non-list service secrets sections", () => {
    // Bypasses nothing: the parse gate owns shape validation — a bare
    // string where a list belongs is a schema failure.
    const content = [
      "services:",
      "  web:",
      "    image: nginx:latest",
      "    secrets: db_password",
      "secrets:",
      "  db_password:",
      "    file: ./secrets/db_password.txt",
      "",
    ].join("\n");
    expect(() => parseComposeDocument(content, COMPOSE_PATH)).toThrow(
      ValidationError
    );
  });

  it("rejects references to undefined top-level secrets", () => {
    const content = [
      "services:",
      "  web:",
      "    image: nginx:latest",
      "    secrets:",
      "      - ghost",
      "secrets:",
      "  db_password:",
      "    file: ./secrets/db_password.txt",
      "",
    ].join("\n");
    expect(() => parseComposeDocument(content, COMPOSE_PATH)).toThrow(
      ValidationError
    );
  });

  it("handles secrets not used by any service", () => {
    const content = [
      "services:",
      "  web:",
      "    image: nginx:latest",
      "secrets:",
      "  unused:",
      "    file: ./secrets/unused.txt",
      "",
    ].join("\n");
    const { secrets: result } = parseComposeDocument(content, COMPOSE_PATH);
    expect(result).toHaveLength(1);
    expect(result[0].services).toEqual([]);
  });

  it("resolves relative secret paths against the compose directory", () => {
    const content = [
      "services:",
      "  web:",
      "    image: nginx:latest",
      "    secrets:",
      "      - db_password",
      "secrets:",
      "  db_password:",
      "    file: ./secrets/db_password.txt",
      "",
    ].join("\n");
    const { secrets: result } = parseComposeDocument(
      content,
      "/data/repos/abc/stacks/myapp/docker-compose.yaml"
    );
    expect(result[0].filePath).toBe(
      "/data/repos/abc/stacks/myapp/secrets/db_password.txt"
    );
  });

  it("keeps absolute secret paths as-is when resolving", () => {
    const content = [
      "services:",
      "  web:",
      "    image: nginx:latest",
      "    secrets:",
      "      - db_password",
      "secrets:",
      "  db_password:",
      "    file: /run/secrets/db_password",
      "",
    ].join("\n");
    const { secrets: result } = parseComposeDocument(
      content,
      "/data/repos/abc/stacks/myapp/docker-compose.yaml"
    );
    expect(result[0].filePath).toBe("/run/secrets/db_password");
  });
});

describe("parseComposeDocument", () => {
  it("parses a valid compose document", () => {
    const { doc: compose } = parseComposeDocument(
      "services:\n  web:\n    image: nginx:latest\n"
    );
    expect(Object.keys(compose.services)).toEqual(["web"]);
    expect(compose.services.web.image).toBe("nginx:latest");
  });

  it("rejects YAML syntax errors", () => {
    expect(() => parseComposeDocument("{unclosed: [")).toThrow(
      ValidationError
    );
  });

  it("rejects documents without a services section", () => {
    expect(() => parseComposeDocument("version: '3'\n")).toThrow(
      "missing 'services' section"
    );
  });

  it("rejects non-object services", () => {
    expect(() => parseComposeDocument("services: just-a-string\n")).toThrow(
      ValidationError
    );
  });

  it("rejects non-object service entries", () => {
    expect(() =>
      parseComposeDocument("services:\n  web: just-a-string\n")
    ).toThrow(ValidationError);
  });

  it("rejects malformed secrets envelopes the save gate must catch", () => {
    expect(() =>
      parseComposeDocument(
        "services:\n  web:\n    image: nginx:latest\nsecrets: not-a-map\n"
      )
    ).toThrow(/secrets/);
  });

  it("names the offending path for shape failures (not a generic services line)", () => {
    expect(() =>
      parseComposeDocument(
        "services:\n  web:\n    image: nginx:latest\nsecrets: not-a-map\n"
      )
    ).toThrow("Invalid compose file: secrets:");
    // The missing-services case keeps its dedicated message.
    expect(() => parseComposeDocument("version: '3'\n")).toThrow(
      "missing 'services' section"
    );
  });

  it("tolerates exotic but valid shapes (numeric ports, extension fields)", () => {
    const { doc: compose } = parseComposeDocument(
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

describe("loadComposeDocument", () => {
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

    const { doc } = loadComposeDocument(filePath);
    expect(doc.services.web.image).toBe("nginx:latest");
    expect(extractNetworkName(doc)).toBe("traefik-net");
  });

  it("throws a ValidationError for a missing services section", () => {
    const filePath = join(tempDir, "docker-compose.yaml");
    writeFileSync(filePath, "version: '3'\n", "utf-8");

    expect(() => loadComposeDocument(filePath)).toThrow(ValidationError);
  });
});
