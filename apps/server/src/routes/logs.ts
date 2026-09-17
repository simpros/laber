import { Elysia } from "elysia";
import * as v from "valibot";
import {
  getContainerLogs,
  followContainerLogs,
  listContainers,
} from "../lib/docker";
import { NotFoundError } from "../lib/errors";
import { sseResponse, encodeEvent } from "../lib/sse";

const logsQuerySchema = v.object({
  follow: v.optional(v.string()),
  tail: v.optional(v.string()),
});

export const logRoutes = new Elysia().get(
  "/api/stacks/:name/logs",
  async ({ params, query }) => {
    const follow = query.follow === "true";
    const tail = parseInt(query.tail ?? "100", 10);

    const containers = await listContainers(params.name);
    if (containers.length === 0) {
      throw new NotFoundError("No containers found for this stack");
    }

    const containerId = containers[0].id;

    if (follow) {
      const stream = await followContainerLogs({
        containerId,
        tail,
      });

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
    }

    const logs = await getContainerLogs({
      containerId,
      tail,
    });

    return { logs };
  },
  { query: logsQuerySchema }
);
