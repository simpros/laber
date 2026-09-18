import { useEffect, useState } from "react";

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
 * A secret row that can also flip secrecy (stack env): `isSecret` owns the
 * chrome, `demoteArmed` marks a demote that is waiting for the server echo.
 * Both stay optional so always-secret rows (stack secrets) share the same
 * transitions without carrying flags they never read.
 */
export type DemotableSecretState = MaskedSecretState & {
  isSecret?: boolean;
  /**
   * Demote armed on an untouched secret: the save flips the row to plain
   * (keep, via `null`) but the chrome stays secret until the refetch echoes
   * the plaintext — so the UI never shows a lying blank plain input that a
   * user could "fill in" and overwrite the kept value with.
   */
  demoteArmed?: boolean;
};

export type SecretStatus = "set" | "unset" | "modified" | "will-clear";

export function secretStatus(entry: MaskedSecretState): SecretStatus {
  if (entry.dirty) return entry.value === "" ? "will-clear" : "modified";
  return entry.hadValue ? "set" : "unset";
}

/**
 * Server snapshot → local row, the one init policy every list editor shares:
 * secrets blank out (the server never echoes values) with `hadValue` from
 * the server; plain rows carry their literal. Callers only attach identity
 * fields (key/name/…) on top.
 */
export function maskedFromServer({
  isSecret,
  value,
  hasValue,
}: {
  isSecret: boolean;
  value?: string;
  hasValue?: boolean;
}): MaskedSecretState {
  return isSecret
    ? { value: "", hadValue: hasValue ?? false, dirty: false }
    : { value: value ?? "", hadValue: false, dirty: false };
}

/** User typed: set the value and mark the row in progress. */
export function touchEntry<T extends MaskedSecretState>(
  entry: T,
  value: string,
): T {
  return { ...entry, value, dirty: true };
}

/**
 * Revert a secret row to the untouched snapshot. Also disarms a pending
 * demote — undo means "back to what the server holds," not "keep the flip."
 */
export function undoSecretEntry<T extends DemotableSecretState>(entry: T): T {
  return { ...entry, value: "", dirty: false, demoteArmed: false };
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

/**
 * Chrome secrecy for a demotable row: an armed demote keeps secret chrome
 * (badge, keep-placeholder) until the server echo lands. The save wire
 * reads this too — never raw `isSecret`.
 */
export function effectiveIsSecret(row: DemotableSecretState): boolean {
  return (row.isSecret ?? false) && !row.demoteArmed;
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
 * Env secrecy toggle as a transition, not a save-time branch.
 *
 * Promoting a plain row that already carries a value marks it dirty, so
 * `valueForSave` sends the carried plaintext and `markSaved` converges to
 * `hadValue: true` — otherwise the badge would say "unset" while the server
 * holds the secret. Re-promoting an armed row just disarms it.
 *
 * Demoting an untouched secret arms the demote instead of flipping
 * `isSecret`: we hold no plaintext to show, so the chrome stays secret and
 * the save sends keep (`null`) + plain-flip — never a lying blank plain
 * input. The server echo (plaintext) then heals the row through
 * `mergeServerEntries`. Demoting a row the user already touched flips
 * immediately: the typed value is right there to send and show.
 */
export function setRowSecret<T extends DemotableSecretState>(
  row: T,
  next: boolean,
): T {
  if (next) {
    if (row.demoteArmed) return { ...row, demoteArmed: false };
    if (!row.isSecret && row.value !== "" && !row.dirty) {
      return { ...row, isSecret: next, dirty: true };
    }
    return { ...row, isSecret: next };
  }
  if (row.isSecret && row.hadValue && !row.dirty) {
    return { ...row, demoteArmed: true };
  }
  return { ...row, isSecret: false, demoteArmed: false };
}

/**
 * Post-save fold for editors that mix secret and plain rows (stack env,
 * core config): secrets clear back to the untouched snapshot, plain rows
 * keep their literals and only lose the dirty flag. Rows carry one secrecy
 * flag (`isSecret`) — the keep/reset decision lives here, so editors never
 * branch on secrecy in their save handlers.
 */
export function markMixedSaved<
  T extends MaskedSecretState & { isSecret: boolean },
>(entry: T): T {
  return entry.isSecret
    ? { ...entry, ...markSaved(entry) }
    : { ...entry, dirty: false };
}

/**
 * Server-echo convergence for prop-initialized lists: non-dirty rows are
 * rebuilt from the latest server snapshot, in-progress (dirty) rows are
 * never touched. This is what heals a demoted env row — local `""` becomes
 * the server plaintext on refetch — without inventing a literal we hold.
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
    return serverByKey.get(keyOf(entry)) ?? entry;
  });
  for (const entry of server) {
    if (!localKeys.has(keyOf(entry))) merged.push(entry);
  }
  return merged;
}

/**
 * List-editor state over the shared model: index updates plus the post-save
 * fold. The default fold resets every row to the untouched snapshot
 * (`markSaved`); editors that mix secret and plain rows pass
 * `markMixedSaved` instead, so the keep/reset decision lives in the model,
 * not in one predicate per editor.
 *
 * Server-vs-local convergence has one policy: `mergeServerEntries`, which
 * heals non-dirty rows per key (a demoted env row absorbs the server
 * plaintext) and never touches in-progress (dirty) rows. The optimistic
 * fold is the other half of the same policy, not a second owner: secrets
 * can only reset locally because the server never echoes their values.
 * Every list editor opts in with one line instead of bolting on its own
 * effect. `keyOf` must be module-stable (all call sites pass module-level
 * helpers) so the sync never re-fires on function identity.
 */
export function useMaskedEntries<T extends MaskedSecretState>(
  init: () => T[],
  sync?: { values: T[]; keyOf: (entry: T) => string },
) {
  const [entries, setEntries] = useState<T[]>(init);

  const syncValues = sync?.values;
  const keyOf = sync?.keyOf;

  useEffect(() => {
    if (!syncValues || !keyOf) return;
    setEntries((prev) => {
      const merged = mergeServerEntries(prev, syncValues, keyOf);
      if (
        merged.length === prev.length &&
        merged.every((m, i) => m === prev[i])
      ) {
        return prev;
      }
      return merged;
    });
  }, [syncValues, keyOf]);

  return {
    entries,
    setEntries,
    update: (index: number, patch: Partial<T>) =>
      setEntries((prev) =>
        prev.map((e, i) => (i === index ? { ...e, ...patch } : e)),
      ),
    /** User typed in row `index`: set the value and mark it in progress. */
    touch: (index: number, value: string) =>
      setEntries((prev) =>
        prev.map((e, i) => (i === index ? touchEntry(e, value) : e)),
      ),
    applySaved: (fold: (entry: T) => T = (e) => ({ ...e, ...markSaved(e) })) =>
      setEntries((prev) => prev.map(fold)),
  };
}
