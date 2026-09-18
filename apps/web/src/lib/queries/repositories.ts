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

/**
 * Query-layer half of the repository add: wire call + invalidation. The page
 * wraps it in `useApiMutation` with its own `onSuccess`
 * (`setShowAddForm(false)`) — no UI callback injected into the query hook.
 */
export function addRepositorySave() {
  return {
    mutationFn: async (input: AddRepositoryInput): Promise<string> => {
      const res = await api.api.repositories.post(input);
      const created = unwrap(res);
      return `Repository added. Discovered ${created.discovered} stack(s).`;
    },
    invalidate: [
      queryKeys.repositories,
      queryKeys.stacks,
      queryKeys.dashboard,
    ],
  };
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
    // Same dashboard coverage as add: repo/stack stats must converge no
    // matter which repo command ran — one policy, not per-author memory.
    invalidate: [
      queryKeys.repositories,
      queryKeys.stacks,
      queryKeys.dashboard,
    ],
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
    // Same dashboard coverage as add; see `useSyncRepository`.
    invalidate: [
      queryKeys.repositories,
      queryKeys.stacks,
      queryKeys.dashboard,
    ],
  });
}
