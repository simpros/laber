import Docker from "dockerode";
import { dirname } from "path";
import { ActionFailedError } from "./errors";
import type { ContainerInfo } from "./types";

export type { ContainerInfo };

let docker: Docker | null = null;

export function getDocker(): Docker {
  if (!docker) {
    docker = new Docker({ socketPath: "/var/run/docker.sock" });
  }
  return docker;
}

function mapContainer(c: Docker.ContainerInfo): ContainerInfo {
  return {
    id: c.Id,
    name: c.Names[0]?.replace(/^\//, "") ?? "",
    image: c.Image,
    state: c.State,
    status: c.Status,
    ports: (c.Ports ?? []).map((p) => ({
      host: p.PublicPort ?? 0,
      container: p.PrivatePort,
      protocol: p.Type ?? "tcp",
    })),
    labels: c.Labels ?? {},
    networks: Object.keys(c.NetworkSettings?.Networks ?? {}),
    createdAt: new Date(c.Created * 1000).toISOString(),
  };
}

export async function listContainers(
  projectLabel?: string
): Promise<ContainerInfo[]> {
  const filters: Record<string, string[]> = {};
  if (projectLabel) {
    filters.label = [`com.docker.compose.project=${projectLabel}`];
  }
  const containers = await getDocker().listContainers({
    all: true,
    filters,
  });
  return containers.map(mapContainer);
}

export function getContainerLogs(options: {
  containerId: string;
  tail?: number;
  since?: number;
}): Promise<string> {
  const container = getDocker().getContainer(options.containerId);

  return container
    .logs({
      stdout: true,
      stderr: true,
      follow: false,
      tail: options.tail ?? 100,
      since: options.since,
    })
    .then((buffer) => buffer.toString());
}

export function followContainerLogs(options: {
  containerId: string;
  tail?: number;
  since?: number;
}): Promise<ReadableStream<string>> {
  const container = getDocker().getContainer(options.containerId);

  return container
    .logs({
      stdout: true,
      stderr: true,
      follow: true,
      tail: options.tail ?? 100,
      since: options.since,
    })
    .then((stream) => {
      return new ReadableStream<string>({
        start(controller) {
          (stream as NodeJS.ReadableStream).on("data", (chunk) => {
            controller.enqueue(chunk.toString());
          });
          (stream as NodeJS.ReadableStream).on("end", () => {
            controller.close();
          });
          (stream as NodeJS.ReadableStream).on("error", (err) => {
            controller.error(err);
          });
        },
        cancel() {
          (
            stream as NodeJS.ReadableStream & { destroy?: () => void }
          ).destroy?.();
        },
      });
    });
}

export async function ensureNetwork(networkName: string): Promise<void> {
  const networks = await getDocker().listNetworks({
    filters: { name: [networkName] },
  });
  const exact = networks.find((n) => n.Name === networkName);
  if (!exact) {
    await getDocker().createNetwork({
      Name: networkName,
      Driver: "bridge",
    });
  }
}

export async function connectContainerToNetwork(
  containerId: string,
  networkName: string
): Promise<void> {
  const network = getDocker().getNetwork(networkName);
  try {
    await network.connect({ Container: containerId });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.includes("already exists")) throw err;
  }
}

export async function execCompose(options: {
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
 * `ActionFailedError` on a nonzero exit. `runLoggedAction` maps that to the
 * contextual failure message; direct callers (repo delete) surface the
 * message in their own warnings.
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

export async function connectTraefikToNetwork(
  networkName: string
): Promise<void> {
  const containers = await getDocker().listContainers({
    all: true,
    filters: {
      name: ["laber-reverse-proxy"],
    },
  });

  const traefik =
    containers.find((c) =>
      c.Names.some((n) => n === "/laber-reverse-proxy")
    ) ??
    containers.find(
      (c) => c.Labels["com.docker.compose.service"] === "reverse-proxy"
    );

  if (!traefik) {
    throw new Error(
      "Traefik container not found. Is the core stack running?"
    );
  }

  await connectContainerToNetwork(traefik.Id, networkName);
}
