import { Elysia } from "elysia";
import * as v from "valibot";
import { getStackLogs } from "../lib/stack-logs";

const logsQuerySchema = v.object({
  follow: v.optional(v.string()),
  tail: v.optional(v.string()),
});

export const logRoutes = new Elysia().get(
  "/api/stacks/:name/logs",
  async ({ params, query }) => {
    return getStackLogs(params.name, {
      follow: query.follow === "true",
      tail: parseInt(query.tail ?? "100", 10),
    });
  },
  { query: logsQuerySchema }
);
