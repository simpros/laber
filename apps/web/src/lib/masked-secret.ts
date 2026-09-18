import { useState } from "react";

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

export type SecretStatus = "set" | "unset" | "modified" | "will-clear";

export function secretStatus(entry: MaskedSecretState): SecretStatus {
  if (entry.dirty) return entry.value === "" ? "will-clear" : "modified";
  return entry.hadValue ? "set" : "unset";
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
 * holds the secret. Demoting an untouched secret keeps `hadValue`, so the
 * save still sends `null` (keep): we hold no plaintext to send, and `""`
 * would wrongly clear the stored value.
 */
export function setRowSecret<
  T extends MaskedSecretState & { isSecret: boolean },
>(row: T, next: boolean): T {
  if (next && !row.isSecret && row.value !== "" && !row.dirty) {
    return { ...row, isSecret: next, dirty: true };
  }
  return { ...row, isSecret: next };
}

/**
 * Post-save fold for editors that mix secret and plain rows (stack env,
 * core config): secrets clear back to the untouched snapshot, plain rows
 * keep their literals and only lose the dirty flag. The keep/reset decision
 * lives here — one owner — so editors never branch on `isSecret`/`secret`
 * in their save handlers.
 */
export function markMixedSaved<
  T extends MaskedSecretState & { isSecret?: boolean; secret?: boolean },
>(entry: T): T {
  const secret = entry.isSecret ?? entry.secret ?? true;
  return secret ? { ...entry, ...markSaved(entry) } : { ...entry, dirty: false };
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
 */
export function useMaskedEntries<T extends MaskedSecretState>(
  init: () => T[],
) {
  const [entries, setEntries] = useState<T[]>(init);
  return {
    entries,
    setEntries,
    update: (index: number, patch: Partial<T>) =>
      setEntries((prev) =>
        prev.map((e, i) => (i === index ? { ...e, ...patch } : e)),
      ),
    applySaved: (fold: (entry: T) => T = (e) => ({ ...e, ...markSaved(e) })) =>
      setEntries((prev) => prev.map(fold)),
  };
}
