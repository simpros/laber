import { Elysia } from "elysia";
import { db, user } from "@laber/db";
import { count } from "drizzle-orm";

/**
 * Public setup probe for the SPA (which cannot count users directly): fresh
 * DB → /setup, otherwise → /login. Returns a boolean, never user data.
 */
export const setupRoutes = new Elysia().get(
  "/api/setup/status",
  async () => {
    const [result] = await db.select({ count: count() }).from(user);
    return { needsSetup: result.count === 0 };
  }
);
