import { auth } from "@laber/auth";

/**
 * `null` means no session; a throw (misconfigured provider, broken store)
 * propagates as a 500, so an auth outage never reads as "not logged in".
 */
export async function getSessionUser(request: Request) {
  const result = await auth.api.getSession({
    headers: request.headers,
  });
  return result?.user ?? null;
}
