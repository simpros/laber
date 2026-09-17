import { useMutation, useQuery } from "@tanstack/react-query";
import { api, unwrap } from "@/lib/api";
import type { CoreKey } from "@/lib/core-keys";
import {
  useActionResult,
  useInvalidate,
} from "./actions";

export function useCore() {
  return useQuery({
    queryKey: ["core"],
    queryFn: async () => unwrap(await api.api.core.get()),
  });
}

export function useSaveCoreConfig(opts?: { onSaved?: () => void }) {
  const invalidate = useInvalidate();
  const feedback = useActionResult();
  const mutation = useMutation({
    mutationFn: async (values: Partial<Record<CoreKey, string | null>>) => {
      const res = await api.api.core.config.put(values);
      return unwrap(res);
    },
    onSuccess: (res) => {
      // Fold first so the local snapshot owns the save even if the refetch
      // lags; the server echo then converges underneath.
      opts?.onSaved?.();
      feedback.setResult(res);
      invalidate([
        ["core"],
        ["dashboard"],
      ]);
    },
    onError: (e) => feedback.fail(e),
  });
  return { ...mutation, result: feedback.result, clearResult: feedback.clearResult };
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
  const invalidate = useInvalidate();
  const feedback = useActionResult();
  const mutation = useMutation({
    mutationFn: async (action: CoreAction) => {
      return unwrap(await CORE_ACTIONS[action]());
    },
    onSuccess: (_res, action) => {
      // Throw-on-failure server contract: reaching here means success. The
      // full transcript streams to Activity; the page keeps a pointer only.
      feedback.setResult({
        success: true,
        message: `${CORE_ACTION_LABEL[action]} finished — full log in Activity.`,
      });
      invalidate([
        ["core"],
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
