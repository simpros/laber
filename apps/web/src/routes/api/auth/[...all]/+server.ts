import { getAuth } from "$lib/server/auth";
import type { RequestHandler } from "./$types";

const handler: RequestHandler = async ({ request }) => {
  return getAuth().handler(request);
};

export const GET = handler;
export const POST = handler;
