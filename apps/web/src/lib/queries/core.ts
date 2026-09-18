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
