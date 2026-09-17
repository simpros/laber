import { ActionFailedError, ConflictError } from "./errors";
import { listContainers } from "./docker-engine";

/**
 * The one removable-stack authority: `assertStackRemovable` refuses a
 * disappearance when the stored status is `"deployed"` or live containers
 * still run for the project — fail-closed on an unreadable daemon.
 *
 * One async function, one answer. The sync transaction cannot await Docker,
 * so there is deliberately no status-only twin inside `reconcileStacksTx`:
 * instead every in-process writer of the rows this rule reads (sync
 * materialize, repo delete, stack deploy, stack stop) holds
 * `withRepoLock(repoId)` across probe→commit, closing the window
 * in-process. `stacks.status` stays a UI/history column; only this module
 * decides what "removable" means. Out-of-band daemon changes (another host
 * touching Docker) remain best-effort.
 */

/** Running containers for a compose project. Throws when Docker is unreadable. */
export async function countProjectContainers(
  projectName: string
): Promise<number> {
  const containers = await listContainers(projectName);
  return containers.filter((c) => c.state === "running").length;
}

/**
 * Hard and fail-closed: an unreadable daemon refuses the removal instead of
 * reporting "no containers". This is a commit gate, never a soft probe.
 */
export async function assertStackRemovable(stack: {
  name: string;
  status: string;
}): Promise<void> {
  if (stack.status === "deployed") {
    throw new ConflictError(
      `Cannot sync: stack(s) no longer in repo but still deployed: ${stack.name}. Stop them before syncing.`
    );
  }
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
