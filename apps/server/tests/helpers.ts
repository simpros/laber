import { app } from "../src/app";

export const BASE_URL = "http://localhost";

export function req(path: string, init?: RequestInit): Request {
  return new Request(`${BASE_URL}${path}`, init);
}

export function jsonReq(
  path: string,
  method: string,
  body: unknown,
  cookie?: string
): Request {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (cookie) headers.cookie = cookie;
  return req(path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export async function signUp(
  email?: string
): Promise<{ email: string; cookie: string }> {
  const address = email ?? `test-${crypto.randomUUID()}@example.com`;
  const res = await app.handle(
    jsonReq("/api/auth/sign-up/email", "POST", {
      name: "Test User",
      email: address,
      password: "test-password-123",
    })
  );
  if (res.status >= 400) {
    throw new Error(`sign-up failed: ${res.status} ${await res.text()}`);
  }
  const setCookies =
    typeof res.headers.getSetCookie === "function"
      ? res.headers.getSetCookie()
      : [];
  const cookie = setCookies.map((c) => c.split(";")[0]).join("; ");
  if (!cookie) throw new Error("sign-up did not set a session cookie");
  return { email: address, cookie };
}
