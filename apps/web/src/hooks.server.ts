import { getAuth } from "$lib/server/auth";
import type { Handle } from "@sveltejs/kit";

export const handle: Handle = async ({ event, resolve }) => {
  try {
    const auth = getAuth();
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

  const themeCookie = event.cookies.get("theme");
  const theme = themeCookie === "light" ? "light" : "dark";

  return resolve(event, {
    transformPageChunk: ({ html }) =>
      html.replace("%sveltekit.html.attributes%", `class="${theme}"`),
  });
};
