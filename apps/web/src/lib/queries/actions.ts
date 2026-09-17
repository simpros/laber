import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

/**
 * The one short result channel for mutation-driven pages. Long transcripts
 * (deploy/stop/restart/pull output) live in the Activity panel — every
 * lifecycle op streams there — so pages keep only a short pointer, never a
 * second copy of the log.
 */
export type ActionResult = {
  success?: boolean;
  message?: string;
};

export type ActionFeedback = ReturnType<typeof useActionResult>;

/** Human message for a mutation failure; Eden/ApiError already carry one. */
export function toErrorMessage(
  e: unknown,
  fallback = "Unknown error"
): string {
  return e instanceof Error ? e.message : fallback;
}

/**
 * One result/error channel per mutation: `setResult` on success, `fail` on
 * error, `clearResult` before the next attempt. Deletes the local
 * `{result, setResult}` + `e instanceof Error` ritual from every page.
 * Pages with several mutations render each hook's `result` and clear the
 * sibling channels before firing, so at most one Alert is ever visible.
 */
export function useActionResult() {
  const [result, setResult] = useState<ActionResult | null>(null);
  return {
    result,
    setResult,
    clearResult: () => setResult(null),
    fail: (e: unknown, fallback?: string) =>
      setResult({ success: false, message: toErrorMessage(e, fallback) }),
  };
}

/** Invalidate a set of query keys after a mutation (shared ritual). */
export function useInvalidate() {
  const queryClient = useQueryClient();
  return (keys: readonly unknown[][]) => {
    for (const queryKey of keys) {
      void queryClient.invalidateQueries({ queryKey });
    }
  };
}
