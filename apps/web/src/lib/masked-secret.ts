/**
 * One masked-secret field model for every secret input in the SPA.
 *
 * The server never echoes secret values: empty input keeps the stored value
 * unless touched, when empty clears. `hadValue` is the server snapshot.
 */
export type MaskedSecretState = {
  hadValue: boolean;
  value: string;
  dirty: boolean;
};

/**
 * One secrecy discriminant for every secret row: `plain`/`secret` are steady,
 * `demote-pending` is an untouched secret unchecked but not yet echoed back
 * as plain. Chrome and wire read it separately so neither can cross-wire.
 */
export type Secrecy = "plain" | "secret" | "demote-pending";

export type SecrecyState = {
  secrecy: Secrecy;
};

/** Chrome stays secret through a pending demote (never a blank-plain lie). */
export function chromeIsSecret(row: SecrecyState): boolean {
  return row.secrecy !== "plain";
}

/** Save wire + checkbox: a pending demote already reads as plain. */
export function wireIsSecret(row: SecrecyState): boolean {
  return row.secrecy === "secret";
}

export type SecretStatus = "set" | "unset" | "modified" | "will-clear";

export function secretStatus(entry: MaskedSecretState): SecretStatus {
  if (entry.dirty) return entry.value === "" ? "will-clear" : "modified";
  return entry.hadValue ? "set" : "unset";
}

/**
 * Server snapshot → local row. Secrets blank (never echoed); only steady
 * states returned, so a missing discriminant fails at compile time.
 */
export function maskedFromServer({
  isSecret,
  value,
  hasValue,
}: {
  isSecret: boolean;
  value?: string;
  hasValue?: boolean;
}): MaskedSecretState & SecrecyState {
  return isSecret
    ? { value: "", hadValue: hasValue ?? false, dirty: false, secrecy: "secret" }
    : { value: value ?? "", hadValue: false, dirty: false, secrecy: "plain" };
}

export function touchEntry<T extends MaskedSecretState>(
  entry: T,
  value: string,
): T {
  return { ...entry, value, dirty: true };
}

/** Undo means back to what the server holds, so a pending demote disarms. */
export function undoSecretEntry<T extends MaskedSecretState & SecrecyState>(
  entry: T,
): T {
  return {
    ...entry,
    value: "",
    dirty: false,
    secrecy: entry.secrecy === "demote-pending" ? "secret" : entry.secrecy,
  };
}

export function undoPlainEntry<T extends MaskedSecretState>(
  entry: T,
  serverValue: string,
): T {
  return { ...entry, value: serverValue, dirty: false };
}

/** Empty + dirty, so save sends `""` (clear). */
export function clearSecretEntry<T extends MaskedSecretState>(entry: T): T {
  return { ...entry, value: "", dirty: true };
}

/** True when the entry would save as empty (deploy skips writing it). */
export function isUnset(entry: MaskedSecretState): boolean {
  return entry.dirty ? entry.value === "" : !entry.hadValue;
}

/** Untouched secrets send `null` (keep); everything else sends the literal. */
export function valueForSave(entry: MaskedSecretState): string | null {
  return !entry.dirty && entry.hadValue ? null : entry.value;
}

/** After save the server holds what we sent, so secrets reset to untouched. */
export function markSaved(entry: MaskedSecretState): MaskedSecretState {
  return {
    hadValue: entry.dirty ? entry.value !== "" : entry.hadValue,
    value: "",
    dirty: false,
  };
}

/**
 * Promote marks a value-carrying plain row dirty so the plaintext is sent
 * (badge converges to set); demote pends on untouched secrets (secret
 * chrome, keep + plain-flip on the wire) and flips at once when typed.
 */
export function setRowSecret<T extends MaskedSecretState & SecrecyState>(
  row: T,
  next: boolean,
): T {
  if (next) {
    if (row.secrecy === "demote-pending") return { ...row, secrecy: "secret" };
    if (row.secrecy === "plain" && row.value !== "" && !row.dirty) {
      return { ...row, secrecy: "secret", dirty: true };
    }
    return { ...row, secrecy: "secret" };
  }
  if (row.secrecy === "secret" && row.hadValue && !row.dirty) {
    return { ...row, secrecy: "demote-pending" };
  }
  return { ...row, secrecy: "plain" };
}

/** Keep/reset reads `chromeIsSecret`, so editors never branch on secrecy. */
export function markMixedSaved<T extends MaskedSecretState & SecrecyState>(
  entry: T,
): T {
  return chromeIsSecret(entry)
    ? { ...entry, ...markSaved(entry) }
    : { ...entry, dirty: false };
}

/**
 * Non-dirty rows absorb the snapshot, dirty rows are never touched. Pending
 * intent survives a still-secret echo (pre-save refetch) and heals on plain.
 */
export function mergeServerEntries<T extends MaskedSecretState & SecrecyState>(
  local: T[],
  server: T[],
  keyOf: (entry: T) => string,
): T[] {
  const serverByKey = new Map(server.map((s) => [keyOf(s), s]));
  const localKeys = new Set(local.map(keyOf));
  const merged = local.map((entry) => {
    if (entry.dirty) return entry;
    if (entry.secrecy === "demote-pending") {
      const echoed = serverByKey.get(keyOf(entry));
      if (!echoed) return entry;
      // Still secret on the server → the flip hasn't landed yet.
      if (echoed.secrecy === "secret") return entry;
      return echoed;
    }
    return serverByKey.get(keyOf(entry)) ?? entry;
  });
  for (const entry of server) {
    if (!localKeys.has(keyOf(entry))) merged.push(entry);
  }
  return merged;
}
