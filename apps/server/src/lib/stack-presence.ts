import { ConflictError } from "./errors";
import { listContainers } from "./docker";

/**
 * Stack presence: does a compose project still have *running* containers?
 * Exited containers do not block removal (`listContainers` reports `all`,
 * so the state filter matters). Lives here — not under "repositories" —
 * because sync (via `git.ts`) and delete both need it and neither owns the
 * concept.
 */

/** Running containers for a compose project. Throws when Docker is unreadable. */
export async function countProjectContainers(
  projectName: string
): Promise<number> {
  const containers = await listContainers(projectName);
  return containers.filter((c) => c.state === "running").length;
}

/**
 * Soft probe: an unreadable daemon reports "none" (detail-view parity).
 * Never a commit gate on its own — delete's hard `down` and sync's
 * transactional status guard stay authoritative below it.
 */
export async function hasRunningContainers(
  projectName: string
): Promise<boolean> {
  try {
    return (await countProjectContainers(projectName)) > 0;
  } catch {
    return false;
  }
}

/**
 * The one removable-stack check. Sync calls it for every stack that would
 * be reconciled away (a Docker-aware pre-check before the transaction; the
 * `status === "deployed"` guard inside `reconcileStacksTx` remains as the
 * transactional last resort since the probe cannot run inside a sync tx).
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
  if (await hasRunningContainers(stack.name)) {
    throw new ConflictError(
      `Cannot sync: stack ${stack.name} still has running containers. Stop it before syncing.`
    );
  }
}
