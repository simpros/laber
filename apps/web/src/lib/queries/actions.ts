import {
  useMutation,
  useQueryClient,
  type QueryKey,
} from "@tanstack/react-query";
import { unwrap } from "@/lib/api";

/**
 * The single owner for every TanStack Query key in the SPA. Mutations
 * invalidate from this table instead of ad-hoc string arrays, so the next
 * command cannot miss a key.
 */
export const queryKeys = {
  dashboard: ["dashboard"] as const,
  core: ["core"] as const,
  stacks: ["stacks"] as const,
  stack: (name: string) => ["stack", name] as const,
  repositories: ["repositories"] as const,
};

/** Human message for a mutation failure; Eden/ApiError already carry one. */
export function toErrorMessage(
  e: unknown,
  fallback = "Unknown error",
): string {
  return e instanceof Error ? e.message : fallback;
}

/**
 * The one mutation skeleton in the SPA. `mutationFn` resolves to the success
 * message shown in the page (`null` = silent success); failures surface
 * through React Query's `error`/`isError`, so no hook owns a parallel result
 * channel. Pages render `mutation.data` / `mutation.error` through
 * `MutationNotice` — multi-mutation surfaces pass the group and the notice
 * shows the latest-settled state, so pages never choreograph sibling
 * `reset()` calls.
 */
export function useApiMutation<TData, TVariables>(opts: {
  mutationFn: (variables: TVariables) => Promise<TData>;
  invalidate?: readonly QueryKey[];
  onSuccess?: (data: TData, variables: TVariables) => void;
}) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: opts.mutationFn,
    onSuccess: (data, variables) => {
      // Local snapshot folds first so it owns the save even if the
      // refetch lags; the server echo then converges underneath.
      opts.onSuccess?.(data, variables);
      for (const queryKey of opts.invalidate ?? []) {
        void queryClient.invalidateQueries({ queryKey });
      }
    },
  });
}

type EdenResult = { data: unknown; error: unknown };

/**
 * Lifecycle ops (deploy/stop/restart/pull) as one hook: the action → endpoint
 * table is the discriminator, no if-ladder. Throw-on-failure server contract:
 * reaching `onSuccess` means the op ran; the page keeps a pointer message
 * while the full transcript streams to the Activity panel.
 */
export function useLifecycleAction<TAction extends string>(opts: {
  endpoints: Record<TAction, () => Promise<EdenResult>>;
  labels: Record<TAction, string>;
  invalidate?: readonly QueryKey[];
}) {
  const mutation = useApiMutation({
    mutationFn: async (action: TAction) => {
      unwrap(await opts.endpoints[action]());
      return `${opts.labels[action]} finished — full log in Activity.`;
    },
    invalidate: opts.invalidate,
  });
  return {
    ...mutation,
    pendingAction: mutation.isPending ? mutation.variables : undefined,
  };
}
