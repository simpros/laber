import { Elysia } from "elysia";
import { db, user } from "@laber/db";
import { count } from "drizzle-orm";

/**
 * Public setup probe for the SPA. SvelteKit could count users directly;
 * the SPA cannot, so it needs a public endpoint: fresh DB → /setup,
 * otherwise → /login. No user data leaves here, just a boolean.
 */
export const setupRoutes = new Elysia().get(
  "/api/setup/status",
  async () => {
    const [result] = await db.select({ count: count() }).from(user);
    return { needsSetup: result.count === 0 };
  }
);
