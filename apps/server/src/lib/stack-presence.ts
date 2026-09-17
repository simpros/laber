import { ActionFailedError, ConflictError } from "./errors";
import { listContainers } from "./docker-engine";

/**
 * The one removable-stack authority: `assertStackRemovable` refuses a
 * disappearance only when live containers still run for the project —
 * fail-closed on an unreadable daemon.
 *
 * `stacks.status` is UI/history and deliberately NOT part of this gate: a
 * stale `"deployed"` with nothing running must not force a stop-before-sync
 * round-trip. Deploy/stop still serialize on the per-repo lock — not because
 * of the column, but because they create/remove the live containers this
 * probe reads. The daemon is the ground truth for "will this orphan
 * containers". The sync transaction cannot await Docker, so there is
 * deliberately no twin of the rule inside `reconcileStacksTx`: the async
 * pre-check in `repositories.ts` mints a `RemovableClearance` under the same
 * per-repo lock as repo delete, closing the probe→commit window in-process.
 * Out-of-band daemon changes (another host touching Docker) remain
 * best-effort.
 */

/**
 * Capability proving the fail-closed Docker probe ran for an exact removal
 * set. Branded so only `clearStacksForRemoval` (and `emptyClearance` for the
 * fresh-register case) can mint it: a plain `{ repoId, names }` literal does
 * not typecheck, so `reconcileStacksTx` cannot be called with a forged
 * clearance that skipped Docker. The probe and the commit still run under
 * `withRepoLock` — the clearance is the typed proof, the lock is the timing.
 */
declare const clearanceBrand: unique symbol;
export type RemovableClearance = {
  readonly [clearanceBrand]: true;
  repoId: string;
  /** Stack names the probe cleared for removal. */
  names: string[];
};

/** Mint an empty clearance: fresh register removes nothing, so no probe runs. */
export function emptyClearance(repoId: string): RemovableClearance {
  return { repoId, names: [] } as unknown as RemovableClearance;
}
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

/**
 * Mint a `RemovableClearance` for an exact candidate set: probes every name
 * in parallel under the same fail-closed rule, then seals the cleared set.
 * Callers pass the disappearing stacks (not the whole table) so the
 * clearance names exactly what reconcile may delete.
 */
export async function clearStacksForRemoval(
  repoId: string,
  disappearing: { name: string }[]
): Promise<RemovableClearance> {
  await Promise.all(disappearing.map((stack) => assertStackRemovable(stack)));
  return { repoId, names: disappearing.map((s) => s.name) } as unknown as RemovableClearance;
}
