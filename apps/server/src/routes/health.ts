import { Elysia } from "elysia";
import { count } from "drizzle-orm";
import { db, user } from "@laber/db";
import { errorDetails, getLogger } from "@laber/logging";

const logger = getLogger("server");

export const healthRoutes = new Elysia().get(
  "/health",
  async ({ set }) => {
    try {
      await db.select({ count: count() }).from(user);
    } catch (err) {
      logger.error("Health check failed: {error}", {
        error: errorDetails(err),
      });
      set.status = 503;
      return { status: "error" as const };
    }
    return { status: "ok" as const };
  }
);
