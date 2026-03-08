import { describe, it, expect } from "bun:test";
import { CORE_KEYS, CORE_KEY_GROUPS } from "./core-keys";

describe("CORE_KEY_GROUPS", () => {
  it("has expected groups", () => {
    expect("proxy" in CORE_KEY_GROUPS).toBe(true);
    expect("tunnel" in CORE_KEY_GROUPS).toBe(true);
    expect("companion" in CORE_KEY_GROUPS).toBe(true);
  });
});

describe("CORE_KEYS", () => {
  it("all keys have a group matching CORE_KEY_GROUPS", () => {
    const validGroups = Object.keys(CORE_KEY_GROUPS);
    for (const entry of CORE_KEYS) {
      expect(validGroups).toContain(entry.group);
    }
  });

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

  it("every key has a non-empty label and placeholder", () => {
    for (const entry of CORE_KEYS) {
      expect(entry.label.length).toBeGreaterThan(0);
      expect(entry.placeholder.length).toBeGreaterThan(0);
    }
  });
});
