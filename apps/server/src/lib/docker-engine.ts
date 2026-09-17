import Docker from "dockerode";
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

/** Stop a single container by id. Thin dockerode wrapper (mockable). */
export async function stopContainer(containerId: string): Promise<void> {
  await getDocker().getContainer(containerId).stop();
}

/** Remove a single container by id. Thin dockerode wrapper (mockable). */
export async function removeContainer(containerId: string): Promise<void> {
  await getDocker().getContainer(containerId).remove();
}
