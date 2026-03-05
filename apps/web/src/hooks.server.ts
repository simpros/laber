import { auth } from "$lib/server/auth";
import type { Handle } from "@sveltejs/kit";

export const handle: Handle = async ({ event, resolve }) => {
  try {
    const sessionResult = await auth.api.getSession({
      headers: event.request.headers,
    });

    event.locals.user = sessionResult?.user ?? null;
    event.locals.session = sessionResult?.session ?? null;
  } catch (e) {
    console.error("Auth hook error:", e);
    event.locals.user = null;
    event.locals.session = null;
  }

  return resolve(event);
};
