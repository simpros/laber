import { Elysia } from "elysia";
import { auth } from "@laber/auth";
import {
  HttpError,
  NotFoundError,
  ConflictError,
  ValidationError,
  ActionFailedError,
} from "./lib/errors";
import { getSessionUser } from "./lib/auth";
import { dashboardRoutes } from "./routes/dashboard";
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
    // Same behaviour as the SvelteKit hooks.server.ts guard.
    set.status = 401;
    return { error: "Unauthorized" };
  }
}

export function createApp() {
  const app = new Elysia()
    .onError(({ code, error, set }) => {
      if (error instanceof HttpError) {
        set.status = error.status;
        return { error: error.message };
      }
      if (error instanceof NotFoundError) {
        set.status = 404;
        return { error: error.message };
      }
      if (error instanceof ConflictError) {
        set.status = 409;
        return { error: error.message };
      }
      if (error instanceof ValidationError) {
        set.status = 400;
        return { error: error.message };
      }
      if (error instanceof ActionFailedError) {
        set.status = 500;
        return { error: error.message };
      }
      if (code === "VALIDATION") {
        // Elysia validates route schemas with 422 by default; this API
        // speaks 400 for malformed input (SvelteKit contract).
        set.status = 400;
        return { error: "Invalid request" };
      }
    })
    .all("/api/auth/*", ({ request }) => auth.handler(request))
    // Auth lives outside the guard; everything under it requires a session.
    // No pathname allowlist: adding a public path means mounting it out here,
    // not growing another string branch. Note Elysia validates route schemas
    // before beforeHandle hooks, so an unauthenticated request with a
    // malformed body sees 400 — access is still denied either way.
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
