import { betterAuth } from "better-auth";
import { drizzleAdapter, type DB } from "better-auth/adapters/drizzle";

export function createAuth(
  db: DB,
  options: { baseURL: string; secret: string },
) {
  return betterAuth({
    database: drizzleAdapter(db, { provider: "sqlite" }),
    basePath: "/api/auth",
    baseURL: options.baseURL,
    secret: options.secret,
    emailAndPassword: {
      enabled: true,
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
