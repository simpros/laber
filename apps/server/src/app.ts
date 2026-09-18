import { Elysia } from "elysia";
import { auth } from "@laber/auth";
import { DomainError, type DomainErrorKind } from "./lib/errors";
import { getSessionUser } from "./lib/auth";
import { dashboardRoutes } from "./routes/dashboard";
import { setupRoutes } from "./routes/setup";
import { stackRoutes } from "./routes/stacks";
import { coreRoutes } from "./routes/core";
import { repositoryRoutes } from "./routes/repositories";
import { activityRoutes } from "./routes/activity";
import { logRoutes } from "./routes/logs";

async function requireSession({
  request,
  set,
}: {
  request: Request;
  set: { status?: number | string };
}) {
  if (request.method === "OPTIONS") return;
  const user = await getSessionUser(request);
  if (!user) {
    set.status = 401;
    return { error: "Unauthorized" };
  }
}

export function createApp() {
  const app = new Elysia()
    .onError(({ code, error, set }) => {
      if (error instanceof DomainError) {
        const statusByKind: Record<DomainErrorKind, number> = {
          not_found: 404,
          conflict: 409,
          validation: 400,
          action_failed: 500,
        };
        set.status = statusByKind[error.kind];
        return { error: error.message };
      }
      if (code === "VALIDATION") {
        set.status = 400;
        return { error: "Invalid request" };
      }
    })
    .all("/api/auth/*", ({ request }) => auth.handler(request))
    .use(setupRoutes)
    .guard({ beforeHandle: requireSession }, (app) =>
      app
        .use(dashboardRoutes)
        .use(stackRoutes)
        .use(coreRoutes)
        .use(repositoryRoutes)
        .use(activityRoutes)
        .use(logRoutes)
    );

  return app;
}

export const app = createApp();

export type App = typeof app;
