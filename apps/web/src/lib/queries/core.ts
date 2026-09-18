import { useQuery } from "@tanstack/react-query";
import { api, unwrap } from "@/lib/api";
import type { CoreKey } from "@/lib/core-keys";
import { queryKeys, useLifecycleAction } from "./actions";
import type { LifecycleActionItem } from "./actions";

export function useCore() {
  return useQuery({
    queryKey: queryKeys.core,
    queryFn: async () => unwrap(await api.api.core.get()),
  });
}

/**
 * Query-layer half of the core-config save: wire call + invalidation. The
 * form passes this into `useMaskedListEditor`, which owns entries, payload,
 * and the post-save fold — no `useSave*` hook with an optional `onSaved`.
 */
export function coreConfigSave() {
  return {
    mutationFn: async (
      values: Partial<Record<CoreKey, string | null>>
    ): Promise<string> => {
      const res = await api.api.core.config.put(values);
      return unwrap(res).message;
    },
    invalidate: [queryKeys.core, queryKeys.dashboard],
  };
}

export type CoreAction = "deploy" | "stop" | "restart";

/** Action → endpoint table; the table is the discriminator, no if-ladder. */
const CORE_ACTIONS = {
  deploy: () => api.api.core.deploy.post(),
  stop: () => api.api.core.stop.post(),
  restart: () => api.api.core.restart.post(),
} as const;

export const CORE_ACTION_LABEL: Record<CoreAction, string> = {
  deploy: "Deploy",
  stop: "Stop",
  restart: "Restart",
};

export function useCoreAction() {
  return useLifecycleAction({
    endpoints: CORE_ACTIONS,
    labels: CORE_ACTION_LABEL,
    invalidate: [queryKeys.core, queryKeys.dashboard],
  });
}

/**
 * The core lifecycle catalog, owned by the query layer: the status card and
 * the bottom Deploy button render through the same `LifecycleToolbar` path
 * instead of a hand-rolled pending label in the page.
 */
export const CORE_STATUS_ACTIONS: LifecycleActionItem<CoreAction>[] = [
  { action: "restart", label: "Restart", pendingLabel: "Restarting..." },
  {
    action: "stop",
    label: "Stop",
    pendingLabel: "Stopping...",
    variant: "danger",
  },
];

export const CORE_DEPLOY_ACTION: LifecycleActionItem<CoreAction> = {
  action: "deploy",
  label: "Deploy Core Stack",
  pendingLabel: "Deploying...",
  variant: "primary",
};
