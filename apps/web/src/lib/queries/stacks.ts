import { useMutation, useQuery } from "@tanstack/react-query";
import { api, unwrap } from "@/lib/api";
import {
  useActionResult,
  useInvalidate,
} from "./actions";

export function useStacks() {
  return useQuery({
    queryKey: ["stacks"],
    queryFn: async () => unwrap(await api.api.stacks.get()),
  });
}

export function useStackDetail(name: string) {
  return useQuery({
    queryKey: ["stack", name],
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
  const invalidate = useInvalidate();
  const feedback = useActionResult();
  const mutation = useMutation({
    mutationFn: async (action: StackAction) => {
      return unwrap(await stackEndpoints(name)[action]());
    },
    onSuccess: (_res, action) => {
      // Throw-on-failure server contract: reaching here means success. The
      // full transcript streams to Activity; the page keeps a pointer only.
      feedback.setResult({
        success: true,
        message: `${STACK_ACTION_LABEL[action]} finished — full log in Activity.`,
      });
      invalidate([
        ["stack", name],
        ["stacks"],
        ["dashboard"],
      ]);
    },
    onError: (e) => feedback.fail(e),
  });
  return {
    ...mutation,
    result: feedback.result,
    clearResult: feedback.clearResult,
    pendingAction: mutation.isPending ? mutation.variables : undefined,
  };
}

export type StackEnvPayload = Array<{
  key: string;
  value: string | null;
  isSecret: boolean;
}>;

export function useSaveStackEnv(stackName: string) {
  const invalidate = useInvalidate();
  const feedback = useActionResult();
  const mutation = useMutation({
    mutationFn: async (entries: StackEnvPayload) => {
      const res = await api.api
        .stacks({ name: stackName })
        .env.put({ entries });
      return unwrap(res);
    },
    onSuccess: () => {
      invalidate([["stack", stackName]]);
    },
    onError: (e) => feedback.fail(e, "Save failed"),
  });
  return { ...mutation, result: feedback.result, clearResult: feedback.clearResult };
}

export type StackSecretPayload = Array<{
  name: string;
  value: string | null;
}>;

export function useSaveStackSecrets(stackName: string) {
  const invalidate = useInvalidate();
  const feedback = useActionResult();
  const mutation = useMutation({
    mutationFn: async (entries: StackSecretPayload) => {
      const res = await api.api
        .stacks({ name: stackName })
        .secrets.put({ entries });
      return unwrap(res);
    },
    onSuccess: () => {
      invalidate([["stack", stackName]]);
    },
    onError: (e) => feedback.fail(e, "Save failed"),
  });
  return { ...mutation, result: feedback.result, clearResult: feedback.clearResult };
}

export function useSaveStackCompose(
  stackName: string,
  opts?: { onSaved?: () => void }
) {
  const invalidate = useInvalidate();
  const feedback = useActionResult();
  const mutation = useMutation({
    mutationFn: async (content: string) => {
      const res = await api.api
        .stacks({ name: stackName })
        .compose.put({ content });
      return unwrap(res);
    },
    onSuccess: () => {
      opts?.onSaved?.();
      invalidate([["stack", stackName]]);
    },
    onError: (e) => feedback.fail(e, "Save failed"),
  });
  return { ...mutation, result: feedback.result, clearResult: feedback.clearResult };
}
