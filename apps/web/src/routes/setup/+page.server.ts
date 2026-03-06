import { redirect } from "@sveltejs/kit";
import { db, user } from "@laber/db";
import { count } from "drizzle-orm";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async () => {
  const [result] = await db.select({ count: count() }).from(user);
  if (result.count > 0) throw redirect(302, "/login");
};
