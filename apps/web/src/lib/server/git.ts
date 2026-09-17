import simpleGit from "simple-git";
import { error } from "@sveltejs/kit";
import { db, stacks } from "@laber/db";
import { and, eq, inArray } from "drizzle-orm";
import {
  mkdtempSync,
  writeFileSync,
  unlinkSync,
  readdirSync,
  existsSync,
} from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { parseComposeFile, extractNetworkName } from "./compose-parser";

function withSshKey(
  sshKey: string | undefined,
  fn: (gitEnv: Record<string, string>) => Promise<void>
): Promise<void> {
  if (!sshKey) return fn({});

  const tmpDir = mkdtempSync(join(tmpdir(), "laber-ssh-"));
  const keyPath = join(tmpDir, "id_key");
  writeFileSync(keyPath, sshKey, { mode: 0o600 });

  const gitEnv = {
    GIT_SSH_COMMAND: `ssh -i ${keyPath} -o StrictHostKeyChecking=no`,
  };

  return fn(gitEnv).finally(() => {
    try {
      unlinkSync(keyPath);
    } catch {
      // ignore cleanup errors
    }
  });
}

export async function cloneRepo(
  url: string,
  targetDir: string,
  branch?: string,
  sshKey?: string
): Promise<void> {
  await withSshKey(sshKey, async (gitEnv) => {
    const git = simpleGit();
    const cloneOpts = ["--depth", "1"];
    if (branch) cloneOpts.push("--branch", branch);

    await git.env(gitEnv).clone(url, targetDir, cloneOpts);
  });
}

export async function pullRepo(
  repoDir: string,
  sshKey?: string
): Promise<void> {
  await withSshKey(sshKey, async (gitEnv) => {
    const git = simpleGit(repoDir);
    await git.env(gitEnv).pull();
  });
}

export async function discoverStacks(
  repoDir: string,
  stacksPath: string
): Promise<
  Array<{
    name: string;
    relativePath: string;
    composeFile: string;
    networkName: string | null;
  }>
> {
  const fullPath = join(repoDir, stacksPath);
  if (!existsSync(fullPath)) return [];

  const entries = readdirSync(fullPath, { withFileTypes: true });
  const stacks: Array<{
    name: string;
    relativePath: string;
    composeFile: string;
    networkName: string | null;
  }> = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dirPath = join(fullPath, entry.name);

    for (const candidate of [
      "docker-compose.yaml",
      "docker-compose.yml",
    ]) {
      const composePath = join(dirPath, candidate);
      if (existsSync(composePath)) {
        let networkName: string | null = null;
        try {
          const compose = parseComposeFile(composePath);
          networkName = extractNetworkName(compose) ?? null;
        } catch {
          // ignore parse errors
        }
        stacks.push({
          name: entry.name,
          relativePath: join(stacksPath, entry.name),
          composeFile: candidate,
          networkName,
        });
        break;
      }
    }
  }

  return stacks;
}

export type DiscoveredStack = Awaited<ReturnType<typeof discoverStacks>>[number];

export async function reconcileDiscoveredStacks(
  repoId: string,
  discovered: DiscoveredStack[]
): Promise<{ added: number; updated: number; removed: string[] }> {
  const existing = await db
    .select()
    .from(stacks)
    .where(eq(stacks.repositoryId, repoId));
  const existingByName = new Map(existing.map((s) => [s.name, s]));
  const discoveredByName = new Map(discovered.map((s) => [s.name, s]));

  const added = discovered.filter((s) => !existingByName.has(s.name));
  const changed = discovered.filter((s) => {
    const prev = existingByName.get(s.name);
    return (
      prev &&
      (prev.relativePath !== s.relativePath ||
        prev.composeFile !== s.composeFile ||
        prev.networkName !== s.networkName)
    );
  });
  const removed = existing.filter((s) => !discoveredByName.has(s.name));
  const removedNames = removed.map((s) => s.name);

  // Removal policy: refuse to silently orphan a deployed stack; otherwise
  // delete the stale rows (env/secrets cascade, logs detach) in the same
  // transaction as the adds/updates so sync never leaves zombies behind.
  const deployedRemoved = removed
    .filter((s) => s.status === "deployed")
    .map((s) => s.name);
  if (deployedRemoved.length > 0) {
    error(
      409,
      `Cannot sync: stack(s) no longer in repo but still deployed: ${deployedRemoved.join(", ")}. Stop them before syncing.`
    );
  }

  db.transaction((tx) => {
    if (removedNames.length > 0) {
      tx.delete(stacks).where(
        and(
          eq(stacks.repositoryId, repoId),
          inArray(stacks.name, removedNames)
        )
      );
    }
    if (added.length > 0) {
      tx.insert(stacks).values(
        added.map((s) => ({
          repositoryId: repoId,
          name: s.name,
          relativePath: s.relativePath,
          composeFile: s.composeFile,
          networkName: s.networkName,
        }))
      );
    }
    for (const s of changed) {
      tx.update(stacks)
        .set({
          relativePath: s.relativePath,
          composeFile: s.composeFile,
          networkName: s.networkName,
          updatedAt: new Date(),
        })
        .where(
          and(eq(stacks.repositoryId, repoId), eq(stacks.name, s.name))
        );
    }
  });

  return {
    added: added.length,
    updated: changed.length,
    removed: removedNames,
  };
}
