import { useQuery } from "@tanstack/react-query";
import { api, unwrap } from "@/lib/api";
import { queryKeys, useApiMutation, useLifecycleAction } from "./actions";

export function useStacks() {
  return useQuery({
    queryKey: queryKeys.stacks,
    queryFn: async () => unwrap(await api.api.stacks.get()),
  });
}

export function useStackDetail(name: string) {
  return useQuery({
    queryKey: queryKeys.stack(name),
    queryFn: async () => unwrap(await api.api.stacks({ name }).get()),
  });
}

export type StackAction = "deploy" | "stop" | "restart" | "pull";

/** Action → endpoint table; the table is the discriminator, no switch. */
function stackEndpoints(name: string) {
  const stack = api.api.stacks({ name });
  return {
    deploy: () => stack.deploy.post(),
    stop: () => stack.stop.post(),
    restart: () => stack.restart.post(),
    pull: () => stack.pull.post(),
  } as const;
}

export const STACK_ACTION_LABEL: Record<StackAction, string> = {
  deploy: "Deploy",
  stop: "Stop",
  restart: "Restart",
  pull: "Pull",
};

export function useStackAction(name: string) {
  return useLifecycleAction({
    endpoints: stackEndpoints(name),
    labels: STACK_ACTION_LABEL,
    invalidate: [queryKeys.stack(name), queryKeys.stacks, queryKeys.dashboard],
  });
}

export type StackEnvPayload = Array<{
  key: string;
  value: string | null;
  isSecret: boolean;
}>;

export function useSaveStackEnv(
  stackName: string,
  opts?: { onSaved?: () => void },
) {
  return useApiMutation({
    mutationFn: async (entries: StackEnvPayload) => {
      const res = await api.api
        .stacks({ name: stackName })
        .env.put({ entries });
      unwrap(res);
      return null;
    },
    invalidate: [queryKeys.stack(stackName)],
    onSuccess: () => opts?.onSaved?.(),
  });
}

export type StackSecretPayload = Array<{
  name: string;
  value: string | null;
}>;

export function useSaveStackSecrets(
  stackName: string,
  opts?: { onSaved?: () => void },
) {
  return useApiMutation({
    mutationFn: async (entries: StackSecretPayload) => {
      const res = await api.api
        .stacks({ name: stackName })
        .secrets.put({ entries });
      unwrap(res);
      return null;
    },
    invalidate: [queryKeys.stack(stackName)],
    onSuccess: () => opts?.onSaved?.(),
  });
}

export function useSaveStackCompose(
  stackName: string,
  opts?: { onSaved?: () => void },
) {
  return useApiMutation({
    mutationFn: async (content: string) => {
      const res = await api.api
        .stacks({ name: stackName })
        .compose.put({ content });
      unwrap(res);
      return null;
    },
    invalidate: [queryKeys.stack(stackName)],
    onSuccess: () => opts?.onSaved?.(),
  });
}
