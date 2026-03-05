import { createAuth, type Auth } from "@laber/auth";
import { getDb } from "./db";

let _auth: Auth | null = null;

export function getAuth(): Auth {
  if (!_auth) {
    const db = getDb();
    const baseURL =
      process.env.BETTER_AUTH_BASE_URL ?? "http://localhost:5173";
    const secret =
      process.env.BETTER_AUTH_SECRET ?? "dev-secret-change-me";
    _auth = createAuth(db, { baseURL, secret });
  }
  return _auth;
}
