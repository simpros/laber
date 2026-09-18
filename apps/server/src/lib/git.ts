import simpleGit from "simple-git";
import {
  mkdtempSync,
  writeFileSync,
  unlinkSync,
  readdirSync,
  existsSync,
} from "fs";
import { join } from "path";
import { tmpdir } from "os";

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

/**
 * Filesystem discovery only — no compose parsing (deploy re-parses fresh, so
 * a cached network name would be a second source of truth this server refuses to trust).
 */
export async function discoverStacks(
  repoDir: string,
  stacksPath: string
): Promise<
  Array<{
    name: string;
    relativePath: string;
    composeFile: string;
  }>
> {
  const fullPath = join(repoDir, stacksPath);
  if (!existsSync(fullPath)) return [];

  const entries = readdirSync(fullPath, { withFileTypes: true });
  const stacks: Array<{
    name: string;
    relativePath: string;
    composeFile: string;
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
        stacks.push({
          name: entry.name,
          relativePath: join(stacksPath, entry.name),
          composeFile: candidate,
        });
        break;
      }
    }
  }

  return stacks;
}

export type DiscoveredStack = Awaited<
  ReturnType<typeof discoverStacks>
>[number];
