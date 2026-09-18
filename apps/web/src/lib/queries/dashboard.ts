import { useQuery } from "@tanstack/react-query";
import { api, unwrap } from "@/lib/api";
import { queryKeys } from "./actions";

export function useDashboard() {
  return useQuery({
    queryKey: queryKeys.dashboard,
    // No page-local auth policy: the router gate owns redirects, so a 401 here is a real error.
    queryFn: async () => unwrap(await api.api.dashboard.get()),
  });
}
