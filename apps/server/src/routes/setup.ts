import { Elysia } from "elysia";
import { db, user } from "@laber/db";
import { count } from "drizzle-orm";

export const setupRoutes = new Elysia().get(
  "/api/setup/status",
  async () => {
    const [result] = await db.select({ count: count() }).from(user);
    return { needsSetup: result.count === 0 };
  }
);
