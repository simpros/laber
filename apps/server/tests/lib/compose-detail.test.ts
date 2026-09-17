import "../setup";
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  extractEnvVarNames,
  extractServices,
  extractAllEnvVarNames,
  parseDetailContent,
  readDetailFile,
} from "../../src/lib/compose-detail";
import { ValidationError } from "../../src/lib/errors";

describe("extractEnvVarNames", () => {
  it("returns empty array for undefined input", () => {
    expect(extractEnvVarNames(undefined)).toEqual([]);
  });

  it("extracts variable names from array format", () => {
    const env = ["DB_HOST=${DB_HOST}", "DB_PORT=${DB_PORT}"];
    const result = extractEnvVarNames(env);
    expect(result).toContain("DB_HOST");
    expect(result).toContain("DB_PORT");
  });

  it("extracts variable names without braces", () => {
    const env = ["DB_HOST=$DB_HOST"];
    const result = extractEnvVarNames(env);
    expect(result).toContain("DB_HOST");
  });

  it("extracts variable names from record format", () => {
    const env = {
      db_host: "${DB_HOST}",
      db_port: "${DB_PORT}",
    };
    const result = extractEnvVarNames(env);
    expect(result).toContain("DB_HOST");
    expect(result).toContain("DB_PORT");
  });

  it("deduplicates variable names", () => {
    const env = ["VAR=${MY_VAR}", "OTHER=${MY_VAR}"];
    const result = extractEnvVarNames(env);
    expect(result.filter((v) => v === "MY_VAR")).toHaveLength(1);
  });

  it("extracts multiple variables from a single value", () => {
    const env = ["CONNECTION=${DB_HOST}:${DB_PORT}"];
    const result = extractEnvVarNames(env);
    expect(result).toContain("DB_HOST");
    expect(result).toContain("DB_PORT");
  });

  it("ignores values without variable references", () => {
    const env = ["DB_HOST=localhost", "DB_PORT=5432"];
    expect(extractEnvVarNames(env)).toEqual([]);
  });
});

describe("extractServices", () => {
  it("extracts basic service info", () => {
    const compose = {
      services: {
        web: {
          image: "nginx:latest",
          container_name: "my-web",
        },
      },
    };
    const result = extractServices(compose);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("web");
    expect(result[0].image).toBe("nginx:latest");
    expect(result[0].containerName).toBe("my-web");
  });

  it("extracts ports from services", () => {
    const compose = {
      services: {
        web: {
          image: "nginx:latest",
          ports: ["8080:80", "443:443"],
        },
      },
    };
    const result = extractServices(compose);
    expect(result[0].ports).toEqual([
      { host: 8080, container: 80 },
      { host: 443, container: 443 },
    ]);
  });

  it("handles container-only ports", () => {
    const compose = {
      services: {
        web: {
          image: "nginx:latest",
          ports: ["80"],
        },
      },
    };
    const result = extractServices(compose);
    expect(result[0].ports).toEqual([{ container: 80 }]);
  });

  it("extracts env var names from services", () => {
    const compose = {
      services: {
        db: {
          image: "postgres:15",
          environment: ["POSTGRES_PASSWORD=${DB_PASSWORD}"],
        },
      },
    };
    const result = extractServices(compose);
    expect(result[0].envVars).toContain("DB_PASSWORD");
  });

  it("returns empty image when not specified", () => {
    const compose = {
      services: {
        app: {},
      },
    };
    const result = extractServices(compose);
    expect(result[0].image).toBe("");
  });

  it("extracts traefik route from labels (array format)", () => {
    const compose = {
      services: {
        web: {
          image: "nginx:latest",
          labels: [
            "traefik.enable=true",
            "traefik.http.routers.web.rule=Host(`app.example.com`)",
            "traefik.http.services.web.loadbalancer.server.port=80",
          ],
        },
      },
    };
    const result = extractServices(compose);
    expect(result[0].traefikRoute).toBeDefined();
    expect(result[0].traefikRoute!.subdomain).toBe("app");
    expect(result[0].traefikRoute!.port).toBe(80);
    expect(result[0].traefikRoute!.routerName).toBe("web");
  });

  it("extracts traefik route from labels (record format)", () => {
    const compose = {
      services: {
        web: {
          image: "nginx:latest",
          labels: {
            "traefik.enable": "true",
            "traefik.http.routers.myapp.rule": "Host(`myapp.example.com`)",
            "traefik.http.services.myapp.loadbalancer.server.port": "3000",
          },
        },
      },
    };
    const result = extractServices(compose);
    expect(result[0].traefikRoute).toBeDefined();
    expect(result[0].traefikRoute!.subdomain).toBe("myapp");
    expect(result[0].traefikRoute!.port).toBe(3000);
    expect(result[0].traefikRoute!.routerName).toBe("myapp");
  });

  it("returns undefined traefikRoute when no traefik labels", () => {
    const compose = {
      services: {
        web: { image: "nginx:latest", labels: ["some.other.label=value"] },
      },
    };
    const result = extractServices(compose);
    expect(result[0].traefikRoute).toBeUndefined();
  });

  it("handles multiple services", () => {
    const compose = {
      services: {
        web: { image: "nginx:latest" },
        db: { image: "postgres:15" },
        redis: { image: "redis:7" },
      },
    };
    const result = extractServices(compose);
    expect(result).toHaveLength(3);
    expect(result.map((s) => s.name)).toEqual(["web", "db", "redis"]);
  });
});

describe("extractAllEnvVarNames", () => {
  it("collects env vars from all services", () => {
    const compose = {
      services: {
        web: { environment: ["APP_KEY=${APP_KEY}"] },
        db: { environment: ["DB_PASS=${DB_PASSWORD}"] },
      },
    };
    const result = extractAllEnvVarNames(compose);
    expect(result).toContain("APP_KEY");
    expect(result).toContain("DB_PASSWORD");
  });

  it("deduplicates across services", () => {
    const compose = {
      services: {
        web: { environment: ["SHARED=${SHARED_VAR}"] },
        worker: { environment: ["SHARED=${SHARED_VAR}"] },
      },
    };
    const result = extractAllEnvVarNames(compose);
    expect(result.filter((v) => v === "SHARED_VAR")).toHaveLength(1);
  });

  it("handles services with no environment", () => {
    const compose = {
      services: {
        web: { image: "nginx:latest" },
      },
    };
    expect(extractAllEnvVarNames(compose)).toEqual([]);
  });
});


describe("parseDetailContent", () => {
  it("parses a valid compose document", () => {
    const doc = parseDetailContent(
      "services:\n  web:\n    image: nginx:latest\n"
    );
    expect(Object.keys(doc.services)).toEqual(["web"]);
    expect(doc.services.web.image).toBe("nginx:latest");
  });

  it("rejects YAML syntax errors", () => {
    expect(() => parseDetailContent("{unclosed: [")).toThrow(
      ValidationError
    );
  });

  it("rejects documents without a services section", () => {
    expect(() => parseDetailContent("version: '3'\n")).toThrow(
      "missing 'services' section"
    );
  });

  it("rejects non-object services", () => {
    expect(() => parseDetailContent("services: just-a-string\n")).toThrow(
      ValidationError
    );
  });

  it("rejects non-object service entries", () => {
    expect(() =>
      parseDetailContent("services:\n  web: just-a-string\n")
    ).toThrow(ValidationError);
  });

  it("tolerates exotic but valid shapes (numeric ports, extension fields)", () => {
    const doc = parseDetailContent(
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
    expect(doc.services.web.image).toBe("nginx:latest");
  });
});

describe("readDetailFile", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "laber-detail-test-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns raw text and parsed doc from a single read", () => {
    const content = "services:\n  web:\n    image: nginx:latest\n";
    const filePath = join(tempDir, "docker-compose.yaml");
    writeFileSync(filePath, content, "utf-8");

    const { raw, doc } = readDetailFile(filePath);
    expect(raw).toBe(content);
    expect(doc.services.web.image).toBe("nginx:latest");
  });

  it("throws a ValidationError for a missing services section", () => {
    const filePath = join(tempDir, "docker-compose.yaml");
    writeFileSync(filePath, "version: '3'\n", "utf-8");

    expect(() => readDetailFile(filePath)).toThrow(ValidationError);
  });
});
