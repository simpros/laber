import "./setup";
import { describe, it, expect, beforeAll, afterEach } from "bun:test";
import { readFileSync, existsSync } from "fs";
import { db, coreConfig, deploymentLogs } from "@laber/db";
import { eq } from "drizzle-orm";
import { app } from "../src/app";
import { signUp, req, jsonReq } from "./helpers";
import { ActionFailedError } from "../src/lib/errors";
import { getCoreComposePath } from "../src/lib/core-identity";
import { dockerStub, resetDockerStub } from "./docker-stub";

let cookie = "";

beforeAll(async () => {
  ({ cookie } = await signUp());
});

afterEach(() => {
  resetDockerStub();
});

describe("GET /api/core", () => {
  it("returns the config map with hasValue masking", async () => {
    const res = await app.handle(
      req("/api/core", { headers: { cookie } })
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      config: Record<
        string,
        { value: string; isSecret: boolean; hasValue: boolean }
      >;
      coreServices: unknown[];
      isConfigured: boolean;
    };
    expect(data.config.ROOT_DOMAIN).toBeDefined();
    expect(data.config.CF_DNS_API_TOKEN.isSecret).toBe(true);
    expect(Array.isArray(data.coreServices)).toBe(true);
    expect(typeof data.isConfigured).toBe("boolean");
  });
});

describe("PUT /api/core/config", () => {
  it("sets values, leaves null unchanged, clears empty strings", async () => {
    await db.delete(coreConfig);

    const save = await app.handle(
      jsonReq(
        "/api/core/config",
        "PUT",
        {
          ROOT_DOMAIN: "example.com",
          CF_DNS_API_TOKEN: "tok",
          ACME_EMAIL: null,
        },
        cookie
      )
    );
    expect(save.status).toBe(200);

    const get = (await (
      await app.handle(req("/api/core", { headers: { cookie } }))
    ).json()) as {
      config: Record<
        string,
        { value: string; isSecret: boolean; hasValue: boolean }
      >;
      isConfigured: boolean;
    };
    expect(get.config.ROOT_DOMAIN.value).toBe("example.com");
    expect(get.config.ROOT_DOMAIN.hasValue).toBe(true);
    expect(get.config.CF_DNS_API_TOKEN.value).toBe("");
    expect(get.config.CF_DNS_API_TOKEN.hasValue).toBe(true);
    expect(get.config.ACME_EMAIL.hasValue).toBe(false);
    expect(get.isConfigured).toBe(true);

    await app.handle(
      jsonReq("/api/core/config", "PUT", { ROOT_DOMAIN: null }, cookie)
    );
    const kept = (await (
      await app.handle(req("/api/core", { headers: { cookie } }))
    ).json()) as typeof get;
    expect(kept.config.ROOT_DOMAIN.value).toBe("example.com");

    await app.handle(
      jsonReq("/api/core/config", "PUT", { ROOT_DOMAIN: "" }, cookie)
    );
    const cleared = (await (
      await app.handle(req("/api/core", { headers: { cookie } }))
    ).json()) as typeof get;
    expect(cleared.config.ROOT_DOMAIN.hasValue).toBe(false);

    const bad = await app.handle(
      jsonReq("/api/core/config", "PUT", { NOPE: "x" }, cookie)
    );
    expect(bad.status).toBe(400);

    await app.handle(
      jsonReq(
        "/api/core/config",
        "PUT",
        { ROOT_DOMAIN: "example.com", CF_DNS_API_TOKEN: "tok" },
        cookie
      )
    );
  });
});

describe("POST /api/core/deploy|stop|restart", () => {
  it("requires the mandatory config", async () => {
    await db.delete(coreConfig);
    const res = await app.handle(
      jsonReq("/api/core/deploy", "POST", {}, cookie)
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("required");
  });

  it("deploys, stops and restarts with docker stubbed", async () => {
    await app.handle(
      jsonReq(
        "/api/core/config",
        "PUT",
        { ROOT_DOMAIN: "example.com", CF_DNS_API_TOKEN: "tok" },
        cookie
      )
    );
    dockerStub.runComposeCommand = async (
      _composePath,
      command,
      _projectName,
      _onOutput
    ) => ({
      output: command.includes("up") ? "core up" : "mocked",
    });

    const deploy = await app.handle(
      jsonReq("/api/core/deploy", "POST", {}, cookie)
    );
    expect(deploy.status).toBe(200);
    const deployBody = (await deploy.json()) as {
      output: string;
    };
    expect(deployBody.output).toContain("core up");

    const livePath = getCoreComposePath();
    expect(existsSync(livePath)).toBe(true);
    expect(readFileSync(livePath, "utf-8")).toContain("example.com");

    for (const action of ["stop", "restart"] as const) {
      const res = await app.handle(
        jsonReq(`/api/core/${action}`, "POST", {}, cookie)
      );
      expect(res.status).toBe(200);
      expect(((await res.json()) as { output: string }).output).toBe(
        "mocked"
      );
    }
  });

  it("returns 500 when the core deploy command fails", async () => {
    await app.handle(
      jsonReq(
        "/api/core/config",
        "PUT",
        { ROOT_DOMAIN: "example.com", CF_DNS_API_TOKEN: "tok" },
        cookie
      )
    );
    dockerStub.runComposeCommand = async (
      _composePath,
      _command,
      _projectName,
      onOutput
    ) => {
      onOutput?.("core blew up");
      throw new ActionFailedError("Compose up -d failed for laber-core");
    };

    const res = await app.handle(
      jsonReq("/api/core/deploy", "POST", {}, cookie)
    );
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("Deploying core services failed");
    expect(body.error).not.toContain("core blew up");

    const logs = await db
      .select()
      .from(deploymentLogs)
      .where(eq(deploymentLogs.isCore, true));
    expect(logs.some((l) => (l.output ?? "").includes("core blew up"))).toBe(
      true
    );
  });
});
