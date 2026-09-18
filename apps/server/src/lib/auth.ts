import { auth } from "@laber/auth";

// Null means no session; a throw propagates as 500, so an auth outage never reads as logged out.
export async function getSessionUser(request: Request) {
  const result = await auth.api.getSession({
    headers: request.headers,
  });
  return result?.user ?? null;
}
