import { redirect } from "@sveltejs/kit";
import { db } from "$lib/server/db";
import { user } from "@laber/db";
import { count } from "drizzle-orm";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals }) => {
  if (locals.user) throw redirect(302, "/");

  const [result] = await db.select({ count: count() }).from(user);
  if (result.count === 0) throw redirect(302, "/setup");
};
