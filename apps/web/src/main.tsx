import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "@/lib/theme";
import { queryClient } from "@/lib/query-client";
import { router } from "@/router";
import "@/app.css";

// No `ActivityProvider` here: the SSE stream sits behind the session guard,
// so it mounts under the `app` route (inside `Layout`) — `/login` and
// `/setup` open zero EventSource traffic.
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <RouterProvider router={router} />
      </ThemeProvider>
    </QueryClientProvider>
  </React.StrictMode>
);
