import { createAuth, type Auth } from "@laber/auth";
import { getDb } from "./db";

let _auth: Auth | null = null;

function getAuth(): Auth {
  if (!_auth) {
    const db = getDb();
    const baseURL = process.env.BETTER_AUTH_BASE_URL ?? "http://localhost:5173";
    const secret = process.env.BETTER_AUTH_SECRET ?? "dev-secret-change-me";
    _auth = createAuth(db, { baseURL, secret });
  }
  return _auth;
}

export const auth = new Proxy({} as Auth, {
  get(_target, prop, receiver) {
    return Reflect.get(getAuth(), prop, receiver);
  },
});
