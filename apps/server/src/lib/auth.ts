import { auth } from "@laber/auth";

/**
 * Session gate: better-auth returns `null` when there is no session (→ 401
 * in `requireSession`). Anything it throws — misconfigured provider, broken
 * session store — propagates to `onError` as a 500. An auth outage must not
 * masquerade as "not logged in".
 */
export async function getSessionUser(request: Request) {
  const result = await auth.api.getSession({
    headers: request.headers,
  });
  return result?.user ?? null;
}
