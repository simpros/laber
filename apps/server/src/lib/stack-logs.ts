import {
  getContainerLogs,
  followContainerLogs,
  listContainers,
} from "./docker";
import { NotFoundError } from "./errors";
import { sseResponse, encodeEvent } from "./sse";

/**
 * Stack-log domain: container selection plus snapshot-vs-follow branching.
 * The route module only parses `follow`/`tail` and returns this.
 */
export async function getStackLogs(
  name: string,
  options?: { follow?: boolean; tail?: number }
): Promise<{ logs: string } | Response> {
  const follow = options?.follow ?? false;
  const tail = options?.tail ?? 100;

  const containers = await listContainers(name);
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
}
