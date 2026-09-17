import { error } from "@sveltejs/kit";
import { getRequestEvent } from "$app/server";

export function requireUser() {
  const { locals } = getRequestEvent();
  if (!locals.user) error(401, "Unauthorized");
  return locals.user;
}
