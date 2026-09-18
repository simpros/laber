import { QueryClient } from "@tanstack/react-query";

/**
 * The one query client for the SPA. Lives in its own module (instead of
 * `main.tsx`) so session handoff (`leaveApp`) can clear it without
 * importing the entry point back.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      retry: 1,
    },
  },
});
