import { useQuery } from "@tanstack/react-query";
import { api, unwrap } from "@/lib/api";
import { queryKeys, useLifecycleAction } from "./actions";
import type { LifecycleActionItem } from "./actions";

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

export function stackLifecycleActions(
  isRunning: boolean,
): LifecycleActionItem<StackAction>[] {
  if (isRunning) {
    return [
      { action: "pull", label: "Pull", pendingLabel: "Pulling..." },
      { action: "restart", label: "Restart", pendingLabel: "Restarting..." },
      {
        action: "stop",
        label: "Stop",
        pendingLabel: "Stopping...",
        variant: "danger",
      },
    ];
  }
  return [
    { action: "pull", label: "Pull", pendingLabel: "Pulling..." },
    {
      action: "deploy",
      label: "Deploy",
      pendingLabel: "Deploying...",
      variant: "primary",
    },
  ];
}

export function stackIsRunning(detail: {
  containers: { state: string }[];
  stack: { status: string };
}): boolean {
  if (detail.containers.length > 0) {
    return detail.containers.some((c) => c.state === "running");
  }
  return detail.stack.status === "deployed";
}

export type StackEnvPayload = Array<{
  key: string;
  value: string | null;
  isSecret: boolean;
}>;

export function stackEnvSave(stackName: string) {
  return {
    mutationFn: async (entries: StackEnvPayload): Promise<null> => {
      const res = await api.api
        .stacks({ name: stackName })
        .env.put({ entries });
      unwrap(res);
      return null;
    },
    invalidate: [queryKeys.stack(stackName)],
  };
}

export type StackSecretPayload = Array<{
  name: string;
  value: string | null;
}>;

export function stackSecretsSave(stackName: string) {
  return {
    mutationFn: async (entries: StackSecretPayload): Promise<null> => {
      const res = await api.api
        .stacks({ name: stackName })
        .secrets.put({ entries });
      unwrap(res);
      return null;
    },
    invalidate: [queryKeys.stack(stackName)],
  };
}

export function stackComposeSave(stackName: string) {
  return {
    mutationFn: async (content: string): Promise<null> => {
      const res = await api.api
        .stacks({ name: stackName })
        .compose.put({ content });
      unwrap(res);
      return null;
    },
    invalidate: [queryKeys.stack(stackName)],
  };
}
