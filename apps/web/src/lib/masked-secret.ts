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
 * The single owner for server-vs-local convergence: pass `sync` and the
 * hook rebuilds non-dirty rows from the latest server snapshot (heals a
 * demoted env row without inventing a literal). In-progress (dirty) rows
 * are never touched, and returning the previous reference when nothing
 * changed keeps the effect idempotent. Every list editor opts in with one
 * line instead of bolting on its own effect.
 */
export function useMaskedEntries<T extends MaskedSecretState>(
  init: () => T[],
  sync?: { values: T[]; keyOf: (entry: T) => string },
) {
  const [entries, setEntries] = useState<T[]>(init);

  const syncValues = sync?.values;
  const syncKeyOf = sync?.keyOf;
  useEffect(() => {
    if (!syncValues || !syncKeyOf) return;
    setEntries((prev) => {
      if (prev.some((e) => e.dirty)) return prev;
      const merged = mergeServerEntries(prev, syncValues, syncKeyOf);
      if (
        merged.length === prev.length &&
        merged.every(
          (m, i) => JSON.stringify(m) === JSON.stringify(prev[i]),
        )
      ) {
        return prev;
      }
      return merged;
    });
  }, [syncValues, syncKeyOf]);

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
