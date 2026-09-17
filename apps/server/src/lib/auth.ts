import { auth } from "@laber/auth";

export async function getSessionUser(request: Request) {
  try {
    const result = await auth.api.getSession({
      headers: request.headers,
    });
    return result?.user ?? null;
  } catch (e) {
    console.error("Auth error:", e);
    return null;
  }
}
