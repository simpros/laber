import { describe, it, expect } from "bun:test";
import {
  chromeIsSecret,
  clearSecretEntry,
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
  wireIsSecret,
  type MaskedSecretState,
  type SecrecyState,
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
    ).toEqual({ value: "", hadValue: true, dirty: false, secrecy: "secret" });
    expect(
      maskedFromServer({ isSecret: true, hasValue: false }),
    ).toEqual({ value: "", hadValue: false, dirty: false, secrecy: "secret" });
    expect(
      maskedFromServer({ isSecret: false, value: "example.com" }),
    ).toEqual({
      value: "example.com",
      hadValue: false,
      dirty: false,
      secrecy: "plain",
    });
    expect(maskedFromServer({ isSecret: false })).toEqual({
      value: "",
      hadValue: false,
      dirty: false,
      secrecy: "plain",
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
      undoSecretEntry<MaskedSecretState & SecrecyState>({
        hadValue: true,
        value: "",
        dirty: false,
        secrecy: "demote-pending",
      }),
    ).toEqual({
      hadValue: true,
      value: "",
      dirty: false,
      secrecy: "secret",
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
    secrecy: "plain" | "secret" | "demote-pending";
    hadValue: boolean;
    dirty: boolean;
  };
  const fold = <T extends { hadValue: boolean; value: string; dirty: boolean }>(
    entry: T,
  ) => ({ ...entry, ...markSaved(entry) });

  it("promote-to-secret converges through save (badge says set)", () => {
    const plain: TestRow = {
      key: "TOKEN",
      value: "carried-plaintext",
      secrecy: "plain",
      hadValue: false,
      dirty: false,
    };
    const promoted = setRowSecret(plain, true);
    expect(valueForSave(promoted)).toBe("carried-plaintext");
    const saved = fold(promoted);
    expect(saved.hadValue).toBe(true);
    expect(secretStatus(saved)).toBe("set");
  });

  it("promote of an empty plain row stays unset", () => {
    const plain: TestRow = {
      key: "TOKEN",
      value: "",
      secrecy: "plain",
      hadValue: false,
      dirty: false,
    };
    const promoted = setRowSecret(plain, true);
    expect(valueForSave(promoted)).toBe("");
    expect(secretStatus(fold(promoted))).toBe("unset");
  });

  it("demote of an untouched secret pends instead of showing a blank plain", () => {
    const secret: TestRow = {
      key: "TOKEN",
      value: "",
      secrecy: "secret",
      hadValue: true,
      dirty: false,
    };
    const demoted = setRowSecret(secret, false);
    expect(valueForSave(demoted)).toBeNull();
    expect(demoted.secrecy).toBe("demote-pending");
    expect(chromeIsSecret(demoted)).toBe(true);
    expect(wireIsSecret(demoted)).toBe(false);
    expect(secretStatus(demoted)).toBe("set");
  });

  it("re-promoting a pending row disarms it", () => {
    const secret: TestRow = {
      key: "TOKEN",
      value: "",
      secrecy: "secret",
      hadValue: true,
      dirty: false,
    };
    const demoted = setRowSecret(secret, false);
    expect(demoted.secrecy).toBe("demote-pending");
    const restored = setRowSecret(demoted, true);
    expect(restored).toEqual({ ...secret, secrecy: "secret" });
    expect(chromeIsSecret(restored)).toBe(true);
    expect(wireIsSecret(restored)).toBe(true);
  });

  it("demote of a row with nothing stored flips immediately", () => {
    const secret: TestRow = {
      key: "TOKEN",
      value: "",
      secrecy: "secret",
      hadValue: false,
      dirty: false,
    };
    const demoted = setRowSecret(secret, false);
    expect(demoted.secrecy).toBe("plain");
    expect(valueForSave(demoted)).toBe("");
  });

  it("demote of a typed secret sends the typed value as plain", () => {
    const secret: TestRow = {
      key: "TOKEN",
      value: "typed",
      secrecy: "secret",
      hadValue: true,
      dirty: true,
    };
    const demoted = setRowSecret(secret, false);
    expect(demoted.secrecy).toBe("plain");
    expect(valueForSave(demoted)).toBe("typed");
  });
});

type EnvRow = {
  key: string;
  value: string;
  secrecy: "plain" | "secret" | "demote-pending";
  hadValue: boolean;
  dirty: boolean;
};

describe("markMixedSaved", () => {
  it("resets secrets to the untouched snapshot", () => {
    const entry: EnvRow = {
      key: "A",
      value: "new",
      secrecy: "secret",
      hadValue: true,
      dirty: true,
    };
    expect(markMixedSaved(entry)).toEqual({
      key: "A",
      value: "",
      secrecy: "secret",
      hadValue: true,
      dirty: false,
    });
  });

  it("keeps plain literals and only clears dirty", () => {
    const entry: EnvRow = {
      key: "A",
      value: "literal",
      secrecy: "plain",
      hadValue: false,
      dirty: true,
    };
    expect(markMixedSaved(entry)).toEqual({
      key: "A",
      value: "literal",
      secrecy: "plain",
      hadValue: false,
      dirty: false,
    });
  });

  it("clears only the dirty flag on plain rows", () => {
    const entry: EnvRow = {
      key: "ROOT_DOMAIN",
      value: "example.com",
      secrecy: "plain",
      hadValue: false,
      dirty: true,
    };
    expect(markMixedSaved(entry)).toEqual({
      key: "ROOT_DOMAIN",
      value: "example.com",
      secrecy: "plain",
      hadValue: false,
      dirty: false,
    });
  });
});

describe("mergeServerEntries", () => {
  const keyOf = (e: EnvRow) => e.key;

  it("demote converges end to end: save keeps, echo heals the input", () => {
    const untouched: EnvRow = {
      key: "TOKEN",
      value: "",
      secrecy: "secret",
      hadValue: true,
      dirty: false,
    };
    const demoted = setRowSecret(untouched, false);
    expect(valueForSave(demoted)).toBeNull();
    const folded = markMixedSaved(demoted);
    expect(folded).toEqual({ ...demoted, dirty: false });
    expect(folded.secrecy).toBe("demote-pending");
    expect(chromeIsSecret(folded)).toBe(true);
    expect(wireIsSecret(folded)).toBe(false);
    const echo: EnvRow = {
      key: "TOKEN",
      value: "kept-plaintext",
      secrecy: "plain",
      hadValue: false,
      dirty: false,
    };
    const merged = mergeServerEntries([folded], [echo], keyOf);
    expect(merged).toEqual([echo]);
  });

  it("heals a demoted row even while an unrelated row is dirty", () => {
    const demoted = setRowSecret(
      {
        key: "TOKEN",
        value: "",
        secrecy: "secret",
        hadValue: true,
        dirty: false,
      },
      false,
    );
    const folded = markMixedSaved(demoted);
    const local: EnvRow[] = [
      { key: "A", value: "typing", secrecy: "plain", hadValue: false, dirty: true },
      folded,
    ];
    const server: EnvRow[] = [
      { key: "A", value: "old", secrecy: "plain", hadValue: false, dirty: false },
      {
        key: "TOKEN",
        value: "kept-plaintext",
        secrecy: "plain",
        hadValue: false,
        dirty: false,
      },
    ];
    const merged = mergeServerEntries(local, server, keyOf);
    expect(merged[0]).toEqual(local[0]);
    expect(merged[1]).toEqual(server[1]);
  });

  it("preserves a pending demote across a still-secret echo (pre-save refetch)", () => {
    const demoted = setRowSecret<EnvRow>(
      {
        key: "TOKEN",
        value: "",
        secrecy: "secret",
        hadValue: true,
        dirty: false,
      },
      false,
    );
    expect(demoted.secrecy).toBe("demote-pending");
    const folded = markMixedSaved(demoted);
    const staleEcho: EnvRow = {
      key: "TOKEN",
      value: "",
      secrecy: "secret",
      hadValue: true,
      dirty: false,
    };
    const merged = mergeServerEntries([folded], [staleEcho], keyOf);
    expect(merged).toEqual([folded]);
    expect(merged[0].secrecy).toBe("demote-pending");
    expect(wireIsSecret(merged[0])).toBe(false);
    expect(chromeIsSecret(merged[0])).toBe(true);
    expect(valueForSave(merged[0])).toBeNull();
  });

  it("never clobbers in-progress (dirty) rows", () => {
    const local: EnvRow[] = [
      { key: "A", value: "typing", secrecy: "plain", hadValue: false, dirty: true },
      { key: "B", value: "", secrecy: "secret", hadValue: true, dirty: false },
    ];
    const server: EnvRow[] = [
      { key: "A", value: "old", secrecy: "plain", hadValue: false, dirty: false },
      { key: "B", value: "", secrecy: "secret", hadValue: true, dirty: false },
    ];
    const merged = mergeServerEntries(local, server, keyOf);
    expect(merged[0]).toEqual(local[0]);
    expect(merged[1]).toEqual(server[1]);
  });

  it("appends server-only keys", () => {
    const local: EnvRow[] = [
      { key: "A", value: "x", secrecy: "plain", hadValue: false, dirty: false },
    ];
    const server: EnvRow[] = [
      { key: "A", value: "x", secrecy: "plain", hadValue: false, dirty: false },
      { key: "B", value: "y", secrecy: "plain", hadValue: false, dirty: false },
    ];
    expect(mergeServerEntries(local, server, keyOf)).toEqual(server);
  });
});
