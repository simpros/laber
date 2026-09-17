import { Elysia } from "elysia";
import { auth } from "@laber/auth";
import { HttpError } from "./lib/errors";
import { getSessionUser } from "./lib/auth";
import { dashboardRoutes } from "./routes/dashboard";
import { stackRoutes } from "./routes/stacks";
import { coreRoutes } from "./routes/core";
import { repositoryRoutes } from "./routes/repositories";
import { activityRoutes } from "./routes/activity";
import { logRoutes } from "./routes/logs";

export function createApp() {
  const app = new Elysia()
    .onError(({ error, set }) => {
      if (error instanceof HttpError) {
        set.status = error.status;
        return { error: error.message };
      }
    })
    .all("/api/auth/*", ({ request }) => auth.handler(request))
    .onBeforeHandle(async ({ request, set }) => {
      if (request.method === "OPTIONS") return;
      const { pathname } = new URL(request.url);
      if (pathname.startsWith("/api/auth/")) return;
      if (pathname.startsWith("/api/")) {
        const user = await getSessionUser(request);
        if (!user) {
          // Same behaviour as the SvelteKit hooks.server.ts guard.
          set.status = 401;
          return "Unauthorized";
        }
      }
    })
    .use(dashboardRoutes)
    .use(stackRoutes)
    .use(coreRoutes)
    .use(repositoryRoutes)
    .use(activityRoutes)
    .use(logRoutes);

  return app;
}

export const app = createApp();

export type App = typeof app;
