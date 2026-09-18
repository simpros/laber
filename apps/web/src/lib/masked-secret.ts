// The server never echoes secrets: untouched input keeps the stored value, empty clears.
export type MaskedSecretState = {
  hadValue: boolean;
  value: string;
  dirty: boolean;
};

// Demote-pending is an untouched secret unchecked but not yet echoed back as plain; chrome and wire read it separately.
export type Secrecy = "plain" | "secret" | "demote-pending";

export type SecrecyState = {
  secrecy: Secrecy;
};

export function chromeIsSecret(row: SecrecyState): boolean {
  return row.secrecy !== "plain";
}

export function wireIsSecret(row: SecrecyState): boolean {
  return row.secrecy === "secret";
}

export type SecretStatus = "set" | "unset" | "modified" | "will-clear";

export function secretStatus(entry: MaskedSecretState): SecretStatus {
  if (entry.dirty) return entry.value === "" ? "will-clear" : "modified";
  return entry.hadValue ? "set" : "unset";
}

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

export function clearSecretEntry<T extends MaskedSecretState>(entry: T): T {
  return { ...entry, value: "", dirty: true };
}

export function isUnset(entry: MaskedSecretState): boolean {
  return entry.dirty ? entry.value === "" : !entry.hadValue;
}

// Untouched secrets send null (keep); everything else sends the literal.
export function valueForSave(entry: MaskedSecretState): string | null {
  return !entry.dirty && entry.hadValue ? null : entry.value;
}

export function markSaved(entry: MaskedSecretState): MaskedSecretState {
  return {
    hadValue: entry.dirty ? entry.value !== "" : entry.hadValue,
    value: "",
    dirty: false,
  };
}

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

export function markMixedSaved<T extends MaskedSecretState & SecrecyState>(
  entry: T,
): T {
  return chromeIsSecret(entry)
    ? { ...entry, ...markSaved(entry) }
    : { ...entry, dirty: false };
}

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
