import type { ContainerInfo } from "../src/lib/types";

const unavailable = () => {
  throw new Error("Docker is not available in tests");
};

const defaults = {
  listContainers: unavailable as (
    _projectLabel?: string
  ) => Promise<ContainerInfo[]>,
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
    _onOutput?: (chunk: string) => void,
    _options?: { onFailure?: () => void }
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

/**
 * Mutable stand-in for `src/lib/docker-engine.ts` + `src/lib/compose-cli.ts`.
 * Tests override individual functions per test and call `resetDockerStub()`
 * in `afterEach`.
 */
export const dockerStub: typeof defaults = { ...defaults };

export function resetDockerStub() {
  Object.assign(dockerStub, defaults);
}
