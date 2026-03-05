import { getContainerLogs, listContainers } from "$lib/server/docker";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ params, url }) => {
  const follow = url.searchParams.get("follow") === "true";
  const tail = parseInt(url.searchParams.get("tail") ?? "100", 10);

  const containers = await listContainers(params.name);
  if (containers.length === 0) {
    return new Response("No containers found for this stack", { status: 404 });
  }

  const containerId = containers[0].id;

  if (follow) {
    const stream = (await getContainerLogs({
      containerId,
      tail,
      follow: true,
    })) as ReadableStream<string>;

    const encoder = new TextEncoder();
    const sseStream = new ReadableStream({
      async start(controller) {
        const reader = stream.getReader();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(value)}\n\n`),
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

  const logs = (await getContainerLogs({
    containerId,
    tail,
    follow: false,
  })) as string;

  return new Response(JSON.stringify({ logs }), {
    headers: { "Content-Type": "application/json" },
  });
};
