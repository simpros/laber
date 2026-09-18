import { existsSync } from "fs";
import { dirname } from "path";
import { ActionFailedError } from "./errors";
import {
  listContainers,
  stopContainer,
  removeContainer,
} from "./docker-engine";

/** Raw compose spawn; `runComposeCommand` below is the single failure contract. */
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

  // Stack env travels only via --env-file; process.env is inherited for the docker CLI itself, with no second overlay.
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
 * Exit→throw only, with no cleanup hook: the caller owns secret wipe + compensating `down`.
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
 * Project teardown by name: regular `compose down` while the file exists,
 * container stop/remove by project label when it is gone. Never fails open.
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
