import "../setup";
import { describe, it, expect, afterEach } from "bun:test";
import { join } from "path";
import { tmpdir } from "os";
import { deployStack, escapeEnvValue } from "../../src/lib/deploy";
import { dockerStub, resetDockerStub } from "../docker-stub";

afterEach(() => {
  resetDockerStub();
});

describe("escapeEnvValue", () => {
  it("leaves plain values unquoted", () => {
    expect(escapeEnvValue("hello")).toBe("hello");
    expect(escapeEnvValue("abc123_-./:")).toBe("abc123_-./:");
    expect(escapeEnvValue("")).toBe("");
  });

  it("quotes values containing hashes so they are not parsed as comments", () => {
    expect(escapeEnvValue("a#b")).toBe('"a#b"');
    expect(escapeEnvValue("#leading")).toBe('"#leading"');
  });

  it("quotes values with surrounding whitespace", () => {
    expect(escapeEnvValue(" padded ")).toBe('" padded "');
  });

  it("escapes double quotes and backslashes", () => {
    expect(escapeEnvValue('say "hi"')).toBe('"say \\"hi\\""');
    expect(escapeEnvValue("back\\slash")).toBe('"back\\\\slash"');
  });

  it("escapes newlines so multi-line values stay on one line", () => {
    const escaped = escapeEnvValue("line1\nline2");
    expect(escaped).toBe('"line1\\nline2"');
    expect(escaped).not.toContain("\n");
  });
});

describe("deployStack networks", () => {
  it("creates each network once before up, then attaches Traefik", async () => {
    const calls: string[] = [];
    const logs: string[] = [];
    dockerStub.ensureNetwork = async (networkName) => {
      calls.push(`ensure:${networkName}`);
      return networkName === "main";
    };
    dockerStub.runComposeCommand = async () => {
      calls.push("up");
      return { output: "up\n" };
    };
    dockerStub.connectTraefikToNetwork = async (networkName) => {
      calls.push(`attach:${networkName}`);
    };

    await deployStack({
      composePath: join(tmpdir(), "laber-deploy-networks.yaml"),
      composeBytes: "services: {}\n",
      envVars: {},
      projectName: "probe",
      networks: ["main", "auth", "auth"],
      attachTraefikTo: "auth",
      onOutput: (chunk) => logs.push(chunk),
    });

    expect(calls).toEqual([
      "ensure:main",
      "ensure:auth",
      "up",
      "attach:auth",
    ]);
    expect(logs.join("")).toContain("Created network main");
  });
});
