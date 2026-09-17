import { ActionFailedError, ConflictError } from "./errors";
import { listContainers } from "./docker-engine";

/**
 * Stack presence: the one removable-stack rule, defined once. Sync pre-checks
 * it Docker-aware before the transaction; the status half doubles as the
 * transactional last resort inside `reconcileStacksTx` (the probe cannot run
 * inside a sync tx). Delete needs no pre-gate — hard `down` is its gate.
 */

/** Running containers for a compose project. Throws when Docker is unreadable. */
export async function countProjectContainers(
  projectName: string
): Promise<number> {
  const containers = await listContainers(projectName);
  return containers.filter((c) => c.state === "running").length;
}

/**
 * The deployed half of the removal rule, shared by the async pre-check and
 * the sync-tx last resort so the predicate and conflict text cannot drift.
 */
export function deployedRemovalConflict(names: string[]): ConflictError {
  return new ConflictError(
    `Cannot sync: stack(s) no longer in repo but still deployed: ${names.join(", ")}. Stop them before syncing.`
  );
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
    throw deployedRemovalConflict([stack.name]);
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
