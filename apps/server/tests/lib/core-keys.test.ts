import "../setup";
import { describe, it, expect } from "bun:test";
import { CORE_KEYS } from "../../src/lib/core-keys";

describe("CORE_KEYS", () => {
  it("contains ROOT_DOMAIN", () => {
    expect(CORE_KEYS.some((k) => k.key === "ROOT_DOMAIN")).toBe(true);
  });

  it("contains CF_DNS_API_TOKEN", () => {
    expect(CORE_KEYS.some((k) => k.key === "CF_DNS_API_TOKEN")).toBe(true);
  });

  it("marks CF_DNS_API_TOKEN as secret", () => {
    const token = CORE_KEYS.find((k) => k.key === "CF_DNS_API_TOKEN");
    expect(token?.secret).toBe(true);
  });

  it("every key maps to a config prop", () => {
    for (const entry of CORE_KEYS) {
      expect(entry.prop.length).toBeGreaterThan(0);
    }
    const props = CORE_KEYS.map((k) => k.prop);
    expect(new Set(props).size).toBe(CORE_KEYS.length);
  });

  it("marks ROOT_DOMAIN and CF_DNS_API_TOKEN as required", () => {
    const required = CORE_KEYS.filter((k) => k.required).map((k) => k.key);
    expect(required).toContain("ROOT_DOMAIN");
    expect(required).toContain("CF_DNS_API_TOKEN");
  });
});
