import { QueryClient } from "@tanstack/react-query";

/** One query client; own module so `leaveApp` clears it without importing the entry. */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      retry: 1,
    },
  },
});
