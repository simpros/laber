import { Elysia } from "elysia";
import {
  getContainerLogs,
  followContainerLogs,
  listContainers,
} from "../lib/docker";
import { HttpError } from "../lib/errors";

export const logRoutes = new Elysia().get(
  "/api/stacks/:name/logs",
  async ({ params, query }) => {
    const q = query as Record<string, string | undefined>;
    const follow = q.follow === "true";
    const tail = parseInt(q.tail ?? "100", 10);

    const containers = await listContainers(params.name);
    if (containers.length === 0) {
      throw new HttpError(404, "No containers found for this stack");
    }

    const containerId = containers[0].id;

    if (follow) {
      const stream = await followContainerLogs({
        containerId,
        tail,
      });

      const encoder = new TextEncoder();
      const sseStream = new ReadableStream({
        async start(controller) {
          const reader = stream.getReader();
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify(value)}\n\n`)
              );
            }
            controller.close();
          } catch {
            controller.close();
          }
        },
      });

      return new Response(sseStream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }

    const logs = await getContainerLogs({
      containerId,
      tail,
    });

    return { logs };
  }
);
