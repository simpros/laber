import { redirect } from "@sveltejs/kit";
import { getDb } from "$lib/server/db";
import { user } from "@laber/db";
import { count } from "drizzle-orm";
import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = async ({ locals }) => {
  const db = getDb();
  const [result] = await db.select({ count: count() }).from(user);
  if (result.count === 0) throw redirect(302, "/setup");
  if (!locals.user) throw redirect(302, "/login");

  return { user: locals.user };
};
