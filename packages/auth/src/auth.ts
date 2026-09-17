import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db, schema } from "@laber/db";

const baseURL =
  process.env.BETTER_AUTH_BASE_URL ?? "http://localhost:5173";
const secret = process.env.BETTER_AUTH_SECRET ?? "dev-secret-change-me";

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "sqlite", schema }),
  basePath: "/api/auth",
  baseURL,
  secret,
  emailAndPassword: {
    enabled: true,
  },
});

export type Auth = typeof auth;
