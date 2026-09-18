/**
 * One masked-secret field model for every secret input in the SPA.
 *
 * Contract: the server never sends secret values back, so an empty input
 * means "keep the stored value" — unless the field was touched, in which
 * case empty means "clear". `hadValue` is the server's `hasValue` snapshot;
 * `dirty` flips on the first user edit (or programmatic clear).
 */
export type MaskedSecretState = {
  hadValue: boolean;
  value: string;
  dirty: boolean;
};

/**
 * One secrecy discriminant for every secret row in the SPA — a single flag
 * with three states instead of a dual-flag protocol. `plain` and `secret`
 * are steady states; `demote-pending` is the transient "user unchecked
 * Secret on an untouched secret, save flips it to plain but the server echo
 * hasn't landed yet" state. Two readers derive the two jobs from it, so no
 * call site can wire chrome to the save bit by accident:
 * - `chromeIsSecret` owns the input chrome (badge, placeholder, undo path);
 * - `wireIsSecret` owns the save wire and the checkbox.
 */
export type Secrecy = "plain" | "secret" | "demote-pending";

export type SecrecyState = {
  secrecy: Secrecy;
};

/** Input chrome stays secret through a pending demote (no blank-plain lie). */
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
 * Server snapshot → local row, the one init policy every list editor shares:
 * secrets blank out (the server never echoes values) with `hadValue` from
 * the server; plain rows carry their literal. Returns the full masked +
 * secrecy state (steady `secret`/`plain` only — never `demote-pending`),
 * so callers only attach identity fields (key/name/…) on top and a missing
 * discriminant is a type error, not a runtime chrome/wire bug.
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

/** User typed: set the value and mark the row in progress. */
export function touchEntry<T extends MaskedSecretState>(
  entry: T,
  value: string,
): T {
  return { ...entry, value, dirty: true };
}

/**
 * Revert a secret row to the untouched snapshot. A pending demote disarms
 * back to `secret` — undo means "back to what the server holds," not "keep
 * the flip."
 */
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

/** Restore a plain row to the server literal. */
export function undoPlainEntry<T extends MaskedSecretState>(
  entry: T,
  serverValue: string,
): T {
  return { ...entry, value: serverValue, dirty: false };
}

/** Mark the stored secret cleared (empty + dirty, so save sends `""`). */
export function clearSecretEntry<T extends MaskedSecretState>(entry: T): T {
  return { ...entry, value: "", dirty: true };
}

/** True when the entry would save as empty (deploy skips writing it). */
export function isUnset(entry: MaskedSecretState): boolean {
  return entry.dirty ? entry.value === "" : !entry.hadValue;
}

/**
 * Wire value for save: untouched secrets send `null` (keep), everything
 * else sends the literal input (`""` clears).
 */
export function valueForSave(entry: MaskedSecretState): string | null {
  return !entry.dirty && entry.hadValue ? null : entry.value;
}

/**
 * Local state after a successful save: the server now holds what we sent,
 * so secret inputs clear back to the untouched snapshot.
 */
export function markSaved(entry: MaskedSecretState): MaskedSecretState {
  return {
    hadValue: entry.dirty ? entry.value !== "" : entry.hadValue,
    value: "",
    dirty: false,
  };
}

/**
 * Env secrecy toggle as a transition over the one discriminant, not a
 * save-time branch.
 *
 * Promoting a plain row that already carries a value marks it dirty, so
 * `valueForSave` sends the carried plaintext and `markSaved` converges to
 * `hadValue: true` — otherwise the badge would say "unset" while the server
 * holds the secret. Re-promoting a pending row just disarms it.
 *
 * Demoting an untouched secret moves to `demote-pending` instead of
 * flipping to `plain`: we hold no plaintext to show, so the chrome stays
 * secret and the save sends keep (`null`) + plain-flip — never a lying
 * blank plain input. The server echo (plaintext) then heals the row through
 * `mergeServerEntries`. Demoting a row the user already touched flips
 * immediately to `plain`: the typed value is right there to send and show.
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

/**
 * Post-save fold for editors that mix secret and plain rows (stack env,
 * core config): secret-chrome rows clear back to the untouched snapshot,
 * plain rows keep their literals and only lose the dirty flag. The
 * keep/reset decision reads `chromeIsSecret` here, so editors never branch
 * on secrecy in their save handlers.
 */
export function markMixedSaved<T extends MaskedSecretState & SecrecyState>(
  entry: T,
): T {
  return chromeIsSecret(entry)
    ? { ...entry, ...markSaved(entry) }
    : { ...entry, dirty: false };
}

/**
 * Server-echo convergence for prop-initialized lists: non-dirty rows are
 * rebuilt from the latest server snapshot, in-progress (dirty) rows are
 * never touched. A `demote-pending` row is merge-preserved intent: it
 * survives a still-secret echo (pre-save refetch from Deploy/Pull/focus —
 * the server hasn't flipped yet) and heals only when the echo arrives as
 * `plain` (post-save). Without this, any invalidate before save would
 * clobber the pending demote back to `secret` and the third state would
 * disagree with the sync policy that is supposed to heal it.
 */
export function mergeServerEntries<T extends MaskedSecretState>(
  local: T[],
  server: T[],
  keyOf: (entry: T) => string,
): T[] {
  const serverByKey = new Map(server.map((s) => [keyOf(s), s]));
  const localKeys = new Set(local.map(keyOf));
  const merged = local.map((entry) => {
    if (entry.dirty) return entry;
    if ((entry as Partial<SecrecyState>).secrecy === "demote-pending") {
      const echoed = serverByKey.get(keyOf(entry));
      if (!echoed) return entry;
      const serverSecrecy = (echoed as Partial<SecrecyState>).secrecy;
      // Still secret on the server → keep the pending intent.
      if (serverSecrecy === "secret") return entry;
      // Plain echo → heal to the server plaintext.
      if (serverSecrecy === "plain") return echoed;
      // Secrecy-unaware snapshot fallback: a still-secret echo carries no
      // literal (`value: ""` + `hadValue`), a healed echo carries one.
      if (serverSecrecy === undefined) {
        if (echoed.value === "" && echoed.hadValue) return entry;
        return echoed;
      }
      return echoed;
    }
    return serverByKey.get(keyOf(entry)) ?? entry;
  });
  for (const entry of server) {
    if (!localKeys.has(keyOf(entry))) merged.push(entry);
  }
  return merged;
}
