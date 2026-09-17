import { useMutation, useQuery } from "@tanstack/react-query";
import { api, unwrap } from "@/lib/api";
import {
  useActionResult,
  useInvalidate,
} from "./actions";

export function useRepositories() {
  return useQuery({
    queryKey: ["repositories"],
    queryFn: async () => unwrap(await api.api.repositories.get()),
  });
}

export type AddRepositoryInput = {
  name: string;
  url: string;
  branch: string;
  stacksPath: string;
  sshPrivateKey: string | null;
};

export function useAddRepository(
  opts?: { onAdded?: () => void }
) {
  const invalidate = useInvalidate();
  const feedback = useActionResult();
  const mutation = useMutation({
    mutationFn: async (input: AddRepositoryInput) => {
      const res = await api.api.repositories.post(input);
      return unwrap(res);
    },
    onSuccess: (res) => {
      opts?.onAdded?.();
      feedback.setResult({
        success: true,
        message: `Repository added. Discovered ${res.discovered} stack(s).`,
      });
      invalidate([
        ["repositories"],
        ["stacks"],
        ["dashboard"],
      ]);
    },
    onError: (e) => feedback.fail(e, "Failed to add repository"),
  });
  return { ...mutation, result: feedback.result, clearResult: feedback.clearResult };
}

export function useSyncRepository() {
  const invalidate = useInvalidate();
  const feedback = useActionResult();
  const mutation = useMutation({
    mutationFn: async (repoId: string) => {
      const res = await api.api.repositories({ id: repoId }).sync.post();
      return unwrap(res);
    },
    onSuccess: (res) => {
      const parts = [
        `${res.newStacks} new`,
        `${res.updatedStacks} updated`,
      ];
      if (res.removedStacks.length > 0) {
        parts.push(
          `${res.removedStacks.length} removed (${res.removedStacks.join(", ")})`
        );
      }
      feedback.setResult({
        success: true,
        message: `Synced. Found ${parts.join(", ")} stack(s).`,
      });
      invalidate([["repositories"], ["stacks"]]);
    },
    onError: (e) => feedback.fail(e, "Failed to sync repository"),
  });
  return {
    ...mutation,
    result: feedback.result,
    clearResult: feedback.clearResult,
    syncingRepoId: mutation.isPending ? mutation.variables : undefined,
  };
}

export function useRemoveRepository() {
  const invalidate = useInvalidate();
  const feedback = useActionResult();
  const mutation = useMutation({
    mutationFn: async (repoId: string) => {
      const res = await api.api.repositories({ id: repoId }).delete();
      return unwrap(res);
    },
    onSuccess: () => {
      invalidate([["repositories"], ["stacks"]]);
    },
    onError: (e) => feedback.fail(e, "Failed to remove repository"),
  });
  return { ...mutation, result: feedback.result, clearResult: feedback.clearResult };
}
