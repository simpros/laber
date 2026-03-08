import Docker from "dockerode";
import { dirname } from "path";
import type { ContainerInfo } from "$lib/types";

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
  follow?: boolean;
}): Promise<string | ReadableStream<string>> {
  const container = getDocker().getContainer(options.containerId);

  if (options.follow) {
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

export async function getContainersByLabel(
  labelKey: string,
  labelValue: string
): Promise<ContainerInfo[]> {
  const containers = await getDocker().listContainers({
    all: true,
    filters: { label: [`${labelKey}=${labelValue}`] },
  });
  return containers.map(mapContainer);
}

export async function execCompose(options: {
  composePath: string;
  command: string;
  envVars?: Record<string, string>;
  projectName?: string;
  onOutput?: (chunk: string) => void;
}): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const args = ["compose", "-f", options.composePath];
  if (options.projectName) {
    args.push("--project-name", options.projectName);
  }
  args.push(...options.command.split(" "));

  const env: Record<string, string> = {
    ...process.env,
    ...(options.envVars ?? {}),
  } as Record<string, string>;

  const proc = Bun.spawn(["docker", ...args], {
    env,
    stdout: "pipe",
    stderr: "pipe",
    cwd: dirname(options.composePath),
  });

  if (options.onOutput) {
    const onOutput = options.onOutput;

    async function readStream(stream: ReadableStream<Uint8Array>): Promise<string> {
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
