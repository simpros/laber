import {
  useMutation,
  useQueryClient,
  type MutateOptions,
  type QueryKey,
} from "@tanstack/react-query";
import { unwrap } from "@/lib/api";

/** Single owner for every query key, so no mutation misses an invalidation. */
export const queryKeys = {
  dashboard: ["dashboard"] as const,
  core: ["core"] as const,
  stacks: ["stacks"] as const,
  stack: (name: string) => ["stack", name] as const,
  repositories: ["repositories"] as const,
};

export function toErrorMessage(
  e: unknown,
  fallback = "Unknown error",
): string {
  return e instanceof Error ? e.message : fallback;
}

/** Owned by the query layer; the toolbar imports this type, never the reverse. */
export type LifecycleActionItem<TAction extends string> = {
  action: TAction;
  label: string;
  pendingLabel: string;
  variant?: "primary" | "secondary" | "danger";
};

/**
 * The one mutation skeleton (`null` = silent success). Every submit resets
 * first, so a retry never shows the old failure while pending.
 */
export function useApiMutation<TData, TVariables>(opts: {
  mutationFn: (variables: TVariables) => Promise<TData>;
  invalidate?: readonly QueryKey[];
  onSuccess?: (data: TData, variables: TVariables) => void;
}) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: opts.mutationFn,
    onSuccess: (data, variables) => {
      // Fold first so the local snapshot wins if the refetch lags.
      opts.onSuccess?.(data, variables);
      for (const queryKey of opts.invalidate ?? []) {
        void queryClient.invalidateQueries({ queryKey });
      }
    },
  });
  type Options = MutateOptions<TData, unknown, TVariables> | undefined;
  return {
    ...mutation,
    mutate: (variables: TVariables, options?: Options) => {
      mutation.reset();
      return mutation.mutate(variables, options);
    },
    mutateAsync: (variables: TVariables, options?: Options) => {
      mutation.reset();
      return mutation.mutateAsync(variables, options);
    },
  };
}

type EdenResult = { data: unknown; error: unknown };

/** Throw-on-failure server contract: reaching `onSuccess` means the op ran. */
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
