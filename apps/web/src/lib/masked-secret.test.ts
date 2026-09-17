import { describe, it, expect } from "bun:test";
import {
  secretStatus,
  isUnset,
  valueForSave,
  markSaved,
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
