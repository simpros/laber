import {
  getContainerLogs,
  followContainerLogs,
  listContainers,
} from "./docker-engine";
import { NotFoundError } from "./errors";

/** Container selection plus snapshot-vs-follow branching; the route alone owns SSE framing. */
async function resolveLogContainerId(name: string): Promise<string> {
  const containers = await listContainers(name);
  if (containers.length === 0) {
    throw new NotFoundError("No containers found for this stack");
  }
  return containers[0].id;
}

export async function getStackLogSnapshot(
  name: string,
  tail = 100
): Promise<{ logs: string }> {
  const containerId = await resolveLogContainerId(name);
  const logs = await getContainerLogs({ containerId, tail });
  return { logs };
}

export async function followStackLogs(
  name: string,
  tail = 100
): Promise<ReadableStream<string>> {
  const containerId = await resolveLogContainerId(name);
  return followContainerLogs({ containerId, tail });
}
