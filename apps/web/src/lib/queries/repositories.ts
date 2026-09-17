import { useQuery } from "@tanstack/react-query";
import { api, unwrap } from "@/lib/api";
import { queryKeys, useApiMutation } from "./actions";

export function useRepositories() {
  return useQuery({
    queryKey: queryKeys.repositories,
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

export function useAddRepository(opts?: { onAdded?: () => void }) {
  return useApiMutation({
    mutationFn: async (input: AddRepositoryInput) => {
      const res = await api.api.repositories.post(input);
      const created = unwrap(res);
      return `Repository added. Discovered ${created.discovered} stack(s).`;
    },
    invalidate: [
      queryKeys.repositories,
      queryKeys.stacks,
      queryKeys.dashboard,
    ],
    onSuccess: () => opts?.onAdded?.(),
  });
}

export function useSyncRepository() {
  const mutation = useApiMutation({
    mutationFn: async (repoId: string) => {
      const res = await api.api.repositories({ id: repoId }).sync.post();
      const synced = unwrap(res);
      const parts = [
        `${synced.newStacks} new`,
        `${synced.updatedStacks} updated`,
      ];
      if (synced.removedStacks.length > 0) {
        parts.push(
          `${synced.removedStacks.length} removed (${synced.removedStacks.join(", ")})`,
        );
      }
      return `Synced. Found ${parts.join(", ")} stack(s).`;
    },
    invalidate: [queryKeys.repositories, queryKeys.stacks],
  });
  return {
    ...mutation,
    syncingRepoId: mutation.isPending ? mutation.variables : undefined,
  };
}

export function useRemoveRepository() {
  return useApiMutation({
    mutationFn: async (repoId: string) => {
      const res = await api.api.repositories({ id: repoId }).delete();
      unwrap(res);
      return null;
    },
    invalidate: [queryKeys.repositories, queryKeys.stacks],
  });
}
