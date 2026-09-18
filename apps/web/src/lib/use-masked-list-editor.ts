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
 * The one save orchestration for every masked list editor. `keyOf` must be
 * module-stable or the sync identity thrashes; the fold runs as the
 * required `onSuccess`, so no caller can forget an optional `onSaved`.
 */
export function useMaskedListEditor<
  T extends MaskedSecretState & SecrecyState,
  TPayload,
>(opts: {
  init: () => T[];
  syncValues: T[];
  keyOf: (entry: T) => string;
  /** Entries → wire payload. */
  toPayload: (entries: T[]) => TPayload;
  /** Query-layer save (mutationFn + invalidation); the fold is wired here. */
  save: {
    mutationFn: (payload: TPayload) => Promise<string | null>;
    invalidate?: readonly QueryKey[];
  };
  /** Post-save fold. */
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

  function updateByKey(key: string, patch: Partial<T>) {
    setEntries((prev) =>
      prev.map((e) => (keyOf(e) === key ? { ...e, ...patch } : e)),
    );
  }

  function touch(index: number, value: string) {
    setEntries((prev) =>
      prev.map((e, i) => (i === index ? touchEntry(e, value) : e)),
    );
  }

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
