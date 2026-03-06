import { building } from "$app/environment";
import { auth } from "@laber/auth";
import { runMigrations } from "@laber/db";
import type { Handle } from "@sveltejs/kit";

if (!building) {
  runMigrations();
  console.log("MIGRATED");
}

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

  const { pathname } = event.url;
  if (
    pathname.startsWith("/api/") &&
    !pathname.startsWith("/api/auth/") &&
    !event.locals.user
  ) {
    return new Response("Unauthorized", { status: 401 });
  }

  const themeCookie = event.cookies.get("theme");
  const theme = themeCookie === "light" ? "light" : "dark";

  return resolve(event, {
    transformPageChunk: ({ html }) =>
      html.replace("%sveltekit.html.attributes%", `class="${theme}"`),
  });
};
