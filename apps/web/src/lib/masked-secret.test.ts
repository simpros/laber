import { describe, it, expect } from "bun:test";
import {
  secretStatus,
  isUnset,
  valueForSave,
  markSaved,
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
