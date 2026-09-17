import { existsSync } from "fs";
import { dirname } from "path";
import { ActionFailedError } from "./errors";
import {
  listContainers,
  stopContainer,
  removeContainer,
} from "./docker-engine";

/**
 * Raw compose spawn. Module-private: callers never touch exit codes
 * directly — `runComposeCommand` below is the single failure contract.
 */
async function execCompose(options: {
  composePath: string;
  command: string[];
  projectName?: string;
  onOutput?: (chunk: string) => void;
}): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const args = ["compose", "-f", options.composePath];
  if (options.projectName) {
    args.push("--project-name", options.projectName);
  }
  args.push(...options.command);

  // Stack env travels only via --env-file (see deployStack). The spawned
  // process inherits process.env for the docker CLI itself; there is no
  // second stack-env overlay here by design.
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) env[key] = value;
  }

  const proc = Bun.spawn(["docker", ...args], {
    env,
    stdout: "pipe",
    stderr: "pipe",
    cwd: dirname(options.composePath),
  });

  if (options.onOutput) {
    const onOutput = options.onOutput;

    async function readStream(
      stream: ReadableStream<Uint8Array>
    ): Promise<string> {
      const reader = stream.getReader();
      const decoder = new TextDecoder();
      let full = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value, { stream: true });
        full += text;
        onOutput(text);
      }
      return full;
    }

    const [stdout, stderr] = await Promise.all([
      readStream(proc.stdout),
      readStream(proc.stderr),
    ]);
    const exitCode = await proc.exited;
    return { stdout, stderr, exitCode };
  }

  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const exitCode = await proc.exited;

  return { stdout, stderr, exitCode };
}

/**
 * Single failure contract: returns the command output on success, throws
 * `ActionFailedError` on a nonzero exit. Resource cleanup (secret files,
 * compensating `down`) belongs to the caller — deploy owns wipe + down in
 * its own catch — so this stays exit→throw only with no cleanup hook.
 * `runLoggedAction` maps the throw to the contextual failure message;
 * direct callers surface the message in their own warnings.
 */
export async function runComposeCommand(
  composePath: string,
  command: string[],
  projectName?: string,
  onOutput?: (chunk: string) => void
): Promise<{ output: string }> {
  const result = await execCompose({
    composePath,
    command,
    projectName,
    onOutput,
  });

  const output = result.stdout + result.stderr;
  if (result.exitCode !== 0) {
    throw new ActionFailedError(
      `Compose ${command.join(" ")} failed${projectName ? ` for ${projectName}` : ""}`
    );
  }
  return { output };
}

/**
 * The one project teardown: bring down a compose project by name, not by
 * compose path. When the compose file still exists this is a regular
 * `compose down` (stops containers, removes project networks); when the
 * file is gone (dir removed out of band) containers are stopped/removed by
 * their `com.docker.compose.project` label instead. Either way the failure
 * contract is the same — throw `ActionFailedError`, never fail open — so
 * callers (stop, repo delete) never branch on file existence themselves.
 */
export async function downProject(options: {
  projectName: string;
  composePath?: string;
  onOutput?: (chunk: string) => void;
}): Promise<{ output: string }> {
  const { projectName, composePath, onOutput } = options;
  if (composePath && existsSync(composePath)) {
    return runComposeCommand(composePath, ["down"], projectName, onOutput);
  }
  onOutput?.(
    `Compose file gone for ${projectName}; removing containers by project label...\n`
  );
  let containers;
  try {
    containers = await listContainers(projectName);
  } catch (e) {
    throw new ActionFailedError(
      `Cannot bring down ${projectName}: Docker is unreadable (${e instanceof Error ? e.message : "unknown error"})`
    );
  }
  let output = "";
  for (const c of containers) {
    try {
      if (c.state === "running") await stopContainer(c.id);
      await removeContainer(c.id);
      const line = `Removed container ${c.name}\n`;
      output += line;
      onOutput?.(line);
    } catch (e) {
      throw new ActionFailedError(
        `Cannot bring down ${projectName}: failed to remove container ${c.name} (${e instanceof Error ? e.message : "unknown error"})`
      );
    }
  }
  return { output };
}
