import { describe, it, expect } from "bun:test";
import {
  clearSecretEntry,
  effectiveIsSecret,
  secretStatus,
  isUnset,
  valueForSave,
  markSaved,
  markMixedSaved,
  maskedFromServer,
  mergeServerEntries,
  setRowSecret,
  touchEntry,
  undoPlainEntry,
  undoSecretEntry,
  type DemotableSecretState,
  type MaskedSecretState,
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

describe("maskedFromServer", () => {
  it("blanks secrets with hadValue, carries plain literals", () => {
    expect(
      maskedFromServer({ isSecret: true, hasValue: true }),
    ).toEqual({ value: "", hadValue: true, dirty: false });
    expect(
      maskedFromServer({ isSecret: true, hasValue: false }),
    ).toEqual({ value: "", hadValue: false, dirty: false });
    expect(
      maskedFromServer({ isSecret: false, value: "example.com" }),
    ).toEqual({ value: "example.com", hadValue: false, dirty: false });
    expect(maskedFromServer({ isSecret: false })).toEqual({
      value: "",
      hadValue: false,
      dirty: false,
    });
  });
});

describe("touch / undo / clear transitions", () => {
  it("touch sets the value and marks the row dirty", () => {
    expect(
      touchEntry<MaskedSecretState>(
        { hadValue: true, value: "", dirty: false },
        "new",
      ),
    ).toEqual({ hadValue: true, value: "new", dirty: true });
  });

  it("undoSecret reverts and disarms a pending demote", () => {
    expect(
      undoSecretEntry<DemotableSecretState>({
        hadValue: true,
        value: "",
        dirty: false,
        isSecret: true,
        demoteArmed: true,
      }),
    ).toEqual({
      hadValue: true,
      value: "",
      dirty: false,
      isSecret: true,
      demoteArmed: false,
    });
  });

  it("undoPlain restores the server literal", () => {
    expect(
      undoPlainEntry<MaskedSecretState>(
        { hadValue: false, value: "typing", dirty: true },
        "example.com",
      ),
    ).toEqual({ hadValue: false, value: "example.com", dirty: false });
  });

  it("clear marks the stored secret cleared", () => {
    expect(
      clearSecretEntry<MaskedSecretState>({
        hadValue: true,
        value: "",
        dirty: false,
      }),
    ).toEqual({ hadValue: true, value: "", dirty: true });
  });
});

describe("setRowSecret", () => {
  type TestRow = {
    key: string;
    value: string;
    isSecret: boolean;
    hadValue: boolean;
    dirty: boolean;
    demoteArmed?: boolean;
  };
  const fold = <T extends { hadValue: boolean; value: string; dirty: boolean }>(
    entry: T,
  ) => ({ ...entry, ...markSaved(entry) });

  it("promote-to-secret converges through save (badge says set)", () => {
    const plain: TestRow = {
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
    const plain: TestRow = {
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

  it("demote of an untouched secret arms instead of showing a blank plain", () => {
    const secret: TestRow = {
      key: "TOKEN",
      value: "",
      isSecret: true,
      hadValue: true,
      dirty: false,
    };
    const demoted = setRowSecret(secret, false);
    // The save still sends keep (null), never ""…
    expect(valueForSave(demoted)).toBeNull();
    // …but the chrome stays secret until the echo lands: no lying blank
    // plain input, badge still "set", wire reads plain via the arm.
    expect(demoted.isSecret).toBe(true);
    expect(demoted.demoteArmed).toBe(true);
    expect(effectiveIsSecret(demoted)).toBe(false);
    expect(secretStatus(demoted)).toBe("set");
  });

  it("re-promoting an armed row disarms it", () => {
    const secret: TestRow = {
      key: "TOKEN",
      value: "",
      isSecret: true,
      hadValue: true,
      dirty: false,
    };
    const demoted = setRowSecret(secret, false);
    expect(demoted.demoteArmed).toBe(true);
    const restored = setRowSecret(demoted, true);
    expect(restored).toEqual({ ...secret, demoteArmed: false });
    expect(effectiveIsSecret(restored)).toBe(true);
  });

  it("demote of a row with nothing stored flips immediately", () => {
    const secret: TestRow = {
      key: "TOKEN",
      value: "",
      isSecret: true,
      hadValue: false,
      dirty: false,
    };
    const demoted = setRowSecret(secret, false);
    expect(demoted.isSecret).toBe(false);
    expect(valueForSave(demoted)).toBe("");
  });

  it("demote of a typed secret sends the typed value as plain", () => {
    const secret: TestRow = {
      key: "TOKEN",
      value: "typed",
      isSecret: true,
      hadValue: true,
      dirty: true,
    };
    const demoted = setRowSecret(secret, false);
    expect(demoted.isSecret).toBe(false);
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
    // Post-save fold keeps the secret chrome (still armed — no blank plain
    // lie)…
    const folded = markMixedSaved(demoted);
    expect(folded).toEqual({ ...demoted, dirty: false });
    expect(folded.isSecret).toBe(true);
    expect(effectiveIsSecret(folded)).toBe(false);
    // …and the server echo (now plaintext) heals the row, disarming it.
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

  it("heals a demoted row even while an unrelated row is dirty", () => {
    // The hook must not gate the whole merge on any-dirty: row B's echo
    // heals while row A is still being typed.
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
    const folded = markMixedSaved(demoted);
    const local: EnvRow[] = [
      { key: "A", value: "typing", isSecret: false, hadValue: false, dirty: true },
      folded,
    ];
    const server: EnvRow[] = [
      { key: "A", value: "old", isSecret: false, hadValue: false, dirty: false },
      {
        key: "TOKEN",
        value: "kept-plaintext",
        isSecret: false,
        hadValue: false,
        dirty: false,
      },
    ];
    const merged = mergeServerEntries(local, server, keyOf);
    expect(merged[0]).toEqual(local[0]);
    expect(merged[1]).toEqual(server[1]);
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
