import { ActionFailedError, ConflictError } from "./errors";
import { listContainers } from "./docker-engine";

/**
 * The one removable-stack authority: `stacks.status` is not part of this
 * gate (a stale `"deployed"` must not force a stop-before-sync); the daemon is the ground truth, fail-closed.
 */

/**
 * Capability proving the Docker probe ran for an exact removal set: only the
 * factories below can mint one, so no literal can skip Docker.
 */
export class RemovableClearance {
  private constructor(
    readonly repoId: string,
    /** Stack names the probe cleared for removal. */
    readonly names: readonly string[]
  ) {}

  /**
   * Mint a clearance for the disappearing stacks (not the whole table).
   */
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
/** Running containers for a compose project; throws when Docker is unreadable (fail-closed). */
export async function countProjectContainers(
  projectName: string
): Promise<number> {
  const containers = await listContainers(projectName);
  return containers.filter((c) => c.state === "running").length;
}

/** Fail-closed commit gate, never a soft probe: an unreadable daemon refuses removal. */
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


