import { describe, it, expect } from "bun:test";
import {
  CORE_KEY_ENTRIES,
  CORE_KEY_META,
  CORE_KEY_SECTIONS,
} from "./core-key-meta";

describe("CORE_KEY_META", () => {
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
    for (const section of CORE_KEY_SECTIONS) {
      expect(groups).toContain(section.id);
      expect(section.keys.length).toBeGreaterThan(0);
    }
  });
});

describe("CORE_KEY_SECTIONS", () => {
  it("covers every entry exactly once", () => {
    const sectioned = CORE_KEY_SECTIONS.flatMap((s) =>
      s.keys.map((k) => k.key)
    );
    expect(new Set(sectioned).size).toBe(sectioned.length);
    expect(new Set(sectioned)).toEqual(
      new Set(CORE_KEY_ENTRIES.map((e) => e.key))
    );
  });
});
