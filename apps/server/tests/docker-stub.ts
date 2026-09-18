import type { ContainerInfo } from "../src/lib/types";

const unavailable = () => {
  throw new Error("Docker is not available in tests");
};

const defaults = {
  listContainers: unavailable as (
    _projectLabel?: string
  ) => Promise<ContainerInfo[]>,
  listContainersSoft: async (
    _projectLabel?: string
  ): Promise<ContainerInfo[]> => {
    try {
      return await dockerStub.listContainers(_projectLabel);
    } catch {
      return [];
    }
  },
  getContainerLogs: unavailable as (_options: {
    containerId: string;
    tail?: number;
    since?: number;
  }) => Promise<string>,
  followContainerLogs: unavailable as (_options: {
    containerId: string;
    tail?: number;
    since?: number;
  }) => Promise<ReadableStream<string>>,
  ensureNetwork: async (_networkName: string): Promise<void> => {},
  connectContainerToNetwork: async (
    _containerId: string,
    _networkName: string
  ): Promise<void> => {},
  runComposeCommand: async (
    _composePath: string,
    _command: string[],
    _projectName?: string,
    _onOutput?: (chunk: string) => void
  ): Promise<{ output: string }> => ({
    output: "mocked",
  }),
  connectTraefikToNetwork: async (
    _networkName: string
  ): Promise<void> => {},
  stopContainer: async (_containerId: string): Promise<void> => {},
  removeContainer: async (_containerId: string): Promise<void> => {},
  downProject: async (_options: {
    projectName: string;
    composePath?: string;
    onOutput?: (chunk: string) => void;
  }): Promise<{ output: string }> => ({
    output: "mocked",
  }),
};

export const dockerStub: typeof defaults = { ...defaults };

export function resetDockerStub() {
  Object.assign(dockerStub, defaults);
}
