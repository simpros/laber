import { ActionFailedError, ConflictError } from "./errors";
import { listContainers } from "./docker-engine";


export class RemovableClearance {
  private constructor(
    readonly repoId: string,
    readonly names: readonly string[]
  ) {}

  static async clear(
    repoId: string,
    disappearing: { name: string }[]
  ): Promise<RemovableClearance> {
    await Promise.all(disappearing.map((stack) => assertStackRemovable(stack)));
    return new RemovableClearance(
      repoId,
      disappearing.map((s) => s.name)
    );
  }
}
export async function countProjectContainers(
  projectName: string
): Promise<number> {
  const containers = await listContainers(projectName);
  return containers.filter((c) => c.state === "running").length;
}

export async function assertStackRemovable(stack: {
  name: string;
}): Promise<void> {
  let running: number;
  try {
    running = await countProjectContainers(stack.name);
  } catch (e) {
    throw new ActionFailedError(
      `Cannot sync: cannot verify running containers for stack ${stack.name} (${e instanceof Error ? e.message : "unknown error"}); refusing to remove it`
    );
  }
  if (running > 0) {
    throw new ConflictError(
      `Cannot sync: stack ${stack.name} still has running containers. Stop it before syncing.`
    );
  }
}


