import type { FormEvent } from "react";
import type { QueryKey } from "@tanstack/react-query";
import {
  markSaved,
  useMaskedEntries,
  type MaskedSecretState,
} from "@/lib/masked-secret";
import { useApiMutation } from "@/lib/queries/actions";

/**
 * The one save orchestration for every masked list editor (core config,
 * stack env, stack secrets): server snapshot → entries → payload →
 * mutation → optimistic fold. Editors only render rows.
 *
 * The wire (`mutationFn` + `invalidate`) still lives in `lib/queries/*` —
 * pages pass the query-layer factory's return as `save`, so components
 * never own fetch code. The local fold (`fold`, defaulting to the secret
 * snapshot reset) runs as the mutation's required `onSuccess`: no optional
 * `onSaved` callback that every caller must remember to pass.
 */
export function useMaskedListEditor<T extends MaskedSecretState, TPayload>(opts: {
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
  const { entries, setEntries, update, touch, applySaved } =
    useMaskedEntries<T>(opts.init, {
      values: opts.syncValues,
      keyOf: opts.keyOf,
    });

  const saveMutation = useApiMutation({
    mutationFn: opts.save.mutationFn,
    invalidate: opts.save.invalidate,
    onSuccess: () =>
      applySaved(opts.fold ?? ((e) => ({ ...e, ...markSaved(e) }))),
  });

  function handleSave(e: FormEvent) {
    e.preventDefault();
    saveMutation.mutate(opts.toPayload(entries));
  }

  return {
    entries,
    setEntries,
    update,
    touch,
    saveMutation,
    handleSave,
  };
}
