import { auth } from "@laber/auth";

export async function getSessionUser(request: Request) {
  const result = await auth.api.getSession({
    headers: request.headers,
  });
  return result?.user ?? null;
}
