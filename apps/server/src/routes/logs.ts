import { Elysia } from "elysia";
import * as v from "valibot";
import { getStackLogSnapshot, followStackLogs } from "../lib/stack-logs";
import { sseResponse, encodeEvent } from "../lib/sse";

const logsQuerySchema = v.object({
  follow: v.optional(v.string()),
  tail: v.optional(v.string()),
});

export const logRoutes = new Elysia().get(
  "/api/stacks/:name/logs",
  async ({ params, query }) => {
    const tail = parseInt(query.tail ?? "100", 10);
    if (query.follow !== "true") {
      return getStackLogSnapshot(params.name, tail);
    }

    // SSE framing lives in the route; the lib only hands over the log stream.
    const stream = await followStackLogs(params.name, tail);
    return sseResponse(async (controller, onCleanup) => {
      const reader = stream.getReader();
      onCleanup(() => {
        reader.cancel().catch(() => {
          // already closed
        });
      });
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          controller.enqueue(encodeEvent(JSON.stringify(value)));
        }
        controller.close();
      } catch {
        try {
          controller.close();
        } catch {
          // already closed
        }
      } finally {
        reader.releaseLock();
      }
    });
  },
  { query: logsQuerySchema }
);
