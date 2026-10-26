import { describe, it, expect } from "bun:test";
import {
  CORE_KEY_GROUPS,
  CORE_KEY_META,
  type CoreKeyGroup,
} from "./core-key-meta";

describe("CORE_KEY_GROUPS", () => {
  it("has expected groups", () => {
    expect("proxy" in CORE_KEY_GROUPS).toBe(true);
    expect("tunnel" in CORE_KEY_GROUPS).toBe(true);
    expect("companion" in CORE_KEY_GROUPS).toBe(true);
  });
});

describe("CORE_KEY_META", () => {
  it("covers ROOT_DOMAIN and CF_DNS_API_TOKEN", () => {
    expect(CORE_KEY_META.ROOT_DOMAIN).toBeDefined();
    expect(CORE_KEY_META.CF_DNS_API_TOKEN).toBeDefined();
  });

  it("every entry has a group matching CORE_KEY_GROUPS", () => {
    const validGroups = Object.keys(CORE_KEY_GROUPS);
    for (const entry of Object.values(CORE_KEY_META)) {
      expect(validGroups).toContain(entry.group);
    }
  });

  it("every entry has a non-empty label", () => {
    for (const entry of Object.values(CORE_KEY_META)) {
      expect(entry.label.length).toBeGreaterThan(0);
    }
  });

  it("optional display strings are non-empty when present", () => {
    for (const entry of Object.values(CORE_KEY_META)) {
      if (entry.placeholder !== undefined) {
        expect(entry.placeholder.length).toBeGreaterThan(0);
      }
      if (entry.hint !== undefined) {
        expect(entry.hint.length).toBeGreaterThan(0);
      }
    }
  });

  it("every group has at least one key", () => {
    const groups = Object.values(CORE_KEY_META).map((e) => e.group);
    for (const group of Object.keys(CORE_KEY_GROUPS)) {
      expect(groups).toContain(group as CoreKeyGroup);
    }
  });
});
