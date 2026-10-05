import "../setup";
import { describe, it, expect } from "bun:test";
import {
  extractEnvVarNames,
  extractServices,
  extractAllEnvVarNames,
} from "../../src/lib/compose-services";

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
