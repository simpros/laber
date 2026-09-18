import { useEffect, useState, type FormEvent } from "react";
import type { QueryKey } from "@tanstack/react-query";
import {
  markSaved,
  mergeServerEntries,
  touchEntry,
  type MaskedSecretState,
  type SecrecyState,
} from "@/lib/masked-secret";
import { useApiMutation } from "@/lib/queries/actions";

/**
 * The one save orchestration for every masked list editor (core config,
 * stack env, stack secrets): server snapshot → entries → payload →
 * mutation → optimistic fold. Editors only render rows.
 *
 * List state, server-echo sync (`mergeServerEntries`, per-row: non-dirty
 * rows absorb the snapshot, in-progress edits are never touched), and the
 * post-save fold all live here — the pure model module stays free of React.
 * `keyOf` must be module-stable (all call sites pass module-level helpers)
 * so the list-editor sync identity never thrashes.
 *
 * The wire (`mutationFn` + `invalidate`) still lives in `lib/queries/*` —
 * pages pass the query-layer factory's return as `save`, so components
 * never own fetch code. The local fold (`fold`, defaulting to the secret
 * snapshot reset) runs as the mutation's required `onSuccess`: no optional
 * `onSaved` callback that every caller must remember to pass.
 */
export function useMaskedListEditor<
  T extends MaskedSecretState & SecrecyState,
  TPayload,
>(opts: {
  init: () => T[];
  syncValues: T[];
  keyOf: (entry: T) => string;
  /** Entries → wire payload (`valueForSave` per row; never raw inputs). */
  toPayload: (entries: T[]) => TPayload;
  /** Query-layer save (mutationFn + invalidation); the fold is wired here. */
  save: {
    mutationFn: (payload: TPayload) => Promise<string | null>;
    invalidate?: readonly QueryKey[];
  };
  /** Post-save fold; secrets and mixed editors pass their model fold. */
  fold?: (entry: T) => T;
}) {
  const [entries, setEntries] = useState<T[]>(opts.init);

  const { syncValues, keyOf } = opts;

  useEffect(() => {
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

  const saveMutation = useApiMutation({
    mutationFn: opts.save.mutationFn,
    invalidate: opts.save.invalidate,
    onSuccess: () =>
      setEntries((prev) =>
        prev.map(opts.fold ?? ((e) => ({ ...e, ...markSaved(e) }))),
      ),
  });

  function handleSave(e: FormEvent) {
    e.preventDefault();
    saveMutation.mutate(opts.toPayload(entries));
  }

  function update(index: number, patch: Partial<T>) {
    setEntries((prev) =>
      prev.map((e, i) => (i === index ? { ...e, ...patch } : e)),
    );
  }

  /** Keyed update for fixed catalogs (core config): no index Map in pages. */
  function updateByKey(key: string, patch: Partial<T>) {
    setEntries((prev) =>
      prev.map((e) => (keyOf(e) === key ? { ...e, ...patch } : e)),
    );
  }

  /** User typed in row `index`: set the value and mark it in progress. */
  function touch(index: number, value: string) {
    setEntries((prev) =>
      prev.map((e, i) => (i === index ? touchEntry(e, value) : e)),
    );
  }

  /** Keyed touch for fixed catalogs (core config). */
  function touchByKey(key: string, value: string) {
    setEntries((prev) =>
      prev.map((e) => (keyOf(e) === key ? touchEntry(e, value) : e)),
    );
  }

  return {
    entries,
    setEntries,
    update,
    updateByKey,
    touch,
    touchByKey,
    saveMutation,
    handleSave,
  };
}
