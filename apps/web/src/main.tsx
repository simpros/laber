import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "@/lib/theme";
import { ActivityProvider } from "@/lib/activity";
import { router } from "@/router";
import "@/app.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      retry: 1,
    },
  },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <ActivityProvider>
          <RouterProvider router={router} />
        </ActivityProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </React.StrictMode>
);
