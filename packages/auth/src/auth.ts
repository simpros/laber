import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@laber/db";

const baseURL = process.env.BETTER_AUTH_BASE_URL ?? "http://localhost:5173";
const secret = process.env.BETTER_AUTH_SECRET ?? "dev-secret-change-me";

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "sqlite" }),
  basePath: "/api/auth",
  baseURL,
  secret,
  emailAndPassword: {
    enabled: true,
  },
});

export type Auth = typeof auth;
