import { describe, it, expect } from "bun:test";
import {
  secretStatus,
  isUnset,
  valueForSave,
  markSaved,
  markMixedSaved,
  mergeServerEntries,
  setRowSecret,
} from "./masked-secret";

describe("secretStatus", () => {
  it("maps the keep/clear contract to badges", () => {
    expect(secretStatus({ hadValue: true, value: "", dirty: false })).toBe(
      "set"
    );
    expect(secretStatus({ hadValue: false, value: "", dirty: false })).toBe(
      "unset"
    );
    expect(
      secretStatus({ hadValue: true, value: "new", dirty: true })
    ).toBe("modified");
    expect(secretStatus({ hadValue: true, value: "", dirty: true })).toBe(
      "will-clear"
    );
  });
});

describe("valueForSave", () => {
  it("sends null to keep an untouched value", () => {
    expect(
      valueForSave({ hadValue: true, value: "", dirty: false })
    ).toBeNull();
  });

  it("sends the literal input once touched", () => {
    expect(valueForSave({ hadValue: true, value: "", dirty: true })).toBe(
      ""
    );
    expect(valueForSave({ hadValue: false, value: "x", dirty: true })).toBe(
      "x"
    );
  });
});

describe("isUnset / markSaved", () => {
  it("detects values deploy will skip", () => {
    expect(isUnset({ hadValue: false, value: "", dirty: false })).toBe(true);
    expect(isUnset({ hadValue: true, value: "", dirty: true })).toBe(true);
    expect(isUnset({ hadValue: true, value: "", dirty: false })).toBe(
      false
    );
  });

  it("resets to the untouched snapshot after save", () => {
    expect(
      markSaved({ hadValue: true, value: "new", dirty: true })
    ).toEqual({ hadValue: true, value: "", dirty: false });
    expect(markSaved({ hadValue: true, value: "", dirty: true })).toEqual({
      hadValue: false,
      value: "",
      dirty: false,
    });
  });
});

describe("setRowSecret", () => {
  const fold = <T extends { hadValue: boolean; value: string; dirty: boolean }>(
    entry: T,
  ) => ({ ...entry, ...markSaved(entry) });

  it("promote-to-secret converges through save (badge says set)", () => {
    const plain = {
      key: "TOKEN",
      value: "carried-plaintext",
      isSecret: false,
      hadValue: false,
      dirty: false,
    };
    const promoted = setRowSecret(plain, true);
    // The carried value is sent, not dropped…
    expect(valueForSave(promoted)).toBe("carried-plaintext");
    // …and the post-save fold lands on the untouched snapshot with the
    // server holding the value.
    const saved = fold(promoted);
    expect(saved.hadValue).toBe(true);
    expect(secretStatus(saved)).toBe("set");
  });

  it("promote of an empty plain row stays unset", () => {
    const plain = {
      key: "TOKEN",
      value: "",
      isSecret: false,
      hadValue: false,
      dirty: false,
    };
    const promoted = setRowSecret(plain, true);
    expect(valueForSave(promoted)).toBe("");
    expect(secretStatus(fold(promoted))).toBe("unset");
  });

  it("demote of an untouched secret keeps (null) instead of clearing", () => {
    const secret = {
      key: "TOKEN",
      value: "",
      isSecret: true,
      hadValue: true,
      dirty: false,
    };
    const demoted = setRowSecret(secret, false);
    expect(valueForSave(demoted)).toBeNull();
  });

  it("demote of a typed secret sends the typed value as plain", () => {
    const secret = {
      key: "TOKEN",
      value: "typed",
      isSecret: true,
      hadValue: true,
      dirty: true,
    };
    const demoted = setRowSecret(secret, false);
    expect(valueForSave(demoted)).toBe("typed");
  });
});

type EnvRow = {
  key: string;
  value: string;
  isSecret: boolean;
  hadValue: boolean;
  dirty: boolean;
};

describe("markMixedSaved", () => {
  it("resets secrets to the untouched snapshot", () => {
    const entry: EnvRow = {
      key: "A",
      value: "new",
      isSecret: true,
      hadValue: true,
      dirty: true,
    };
    expect(markMixedSaved(entry)).toEqual({
      key: "A",
      value: "",
      isSecret: true,
      hadValue: true,
      dirty: false,
    });
  });

  it("keeps plain literals and only clears dirty", () => {
    const entry: EnvRow = {
      key: "A",
      value: "literal",
      isSecret: false,
      hadValue: false,
      dirty: true,
    };
    expect(markMixedSaved(entry)).toEqual({
      key: "A",
      value: "literal",
      isSecret: false,
      hadValue: false,
      dirty: false,
    });
  });

  it("clears only the dirty flag on plain rows", () => {
    const entry: EnvRow = {
      key: "ROOT_DOMAIN",
      value: "example.com",
      isSecret: false,
      hadValue: false,
      dirty: true,
    };
    expect(markMixedSaved(entry)).toEqual({
      key: "ROOT_DOMAIN",
      value: "example.com",
      isSecret: false,
      hadValue: false,
      dirty: false,
    });
  });
});

describe("mergeServerEntries", () => {
  const keyOf = (e: EnvRow) => e.key;

  it("demote converges end to end: save keeps, echo heals the input", () => {
    // Untouched secret, user unchecks Secret without typing.
    const demoted = setRowSecret(
      {
        key: "TOKEN",
        value: "",
        isSecret: true,
        hadValue: true,
        dirty: false,
      },
      false,
    );
    // Wire still sends keep (null), never "".
    expect(valueForSave(demoted)).toBeNull();
    // Post-save fold leaves the clean plain row alone…
    const folded = markMixedSaved(demoted);
    expect(folded).toEqual({ ...demoted, dirty: false });
    // …and the server echo (now plaintext) heals the blank input.
    const echo: EnvRow = {
      key: "TOKEN",
      value: "kept-plaintext",
      isSecret: false,
      hadValue: false,
      dirty: false,
    };
    const merged = mergeServerEntries([folded], [echo], keyOf);
    expect(merged).toEqual([echo]);
  });

  it("never clobbers in-progress (dirty) rows", () => {
    const local: EnvRow[] = [
      { key: "A", value: "typing", isSecret: false, hadValue: false, dirty: true },
      { key: "B", value: "", isSecret: true, hadValue: true, dirty: false },
    ];
    const server: EnvRow[] = [
      { key: "A", value: "old", isSecret: false, hadValue: false, dirty: false },
      { key: "B", value: "", isSecret: true, hadValue: true, dirty: false },
    ];
    const merged = mergeServerEntries(local, server, keyOf);
    expect(merged[0]).toEqual(local[0]);
    expect(merged[1]).toEqual(server[1]);
  });

  it("appends server-only keys", () => {
    const local: EnvRow[] = [
      { key: "A", value: "x", isSecret: false, hadValue: false, dirty: false },
    ];
    const server: EnvRow[] = [
      { key: "A", value: "x", isSecret: false, hadValue: false, dirty: false },
      { key: "B", value: "y", isSecret: false, hadValue: false, dirty: false },
    ];
    expect(mergeServerEntries(local, server, keyOf)).toEqual(server);
  });
});
