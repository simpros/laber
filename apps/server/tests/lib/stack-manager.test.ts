import "../setup";
import { describe, it, expect } from "bun:test";
import { escapeEnvValue } from "../../src/lib/stack-manager";

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
