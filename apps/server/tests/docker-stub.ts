import type { ContainerInfo } from "../src/lib/types";

type ExecComposeOptions = {
  composePath: string;
  command: string[];
  projectName?: string;
  onOutput?: (chunk: string) => void;
};

type ExecComposeResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
};

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
  execCompose: async (
    _options: ExecComposeOptions
  ): Promise<ExecComposeResult> => ({
    stdout: "",
    stderr: "Docker is not available in tests",
    exitCode: 1,
  }),
  runComposeCommand: async (
    _composePath: string,
    _command: string[],
    _projectName?: string,
    _onOutput?: (chunk: string) => void
  ): Promise<{ success: boolean; output: string }> => ({
    success: true,
    output: "mocked",
  }),
  connectTraefikToNetwork: async (
    _networkName: string
  ): Promise<void> => {},
};

/**
 * Mutable stand-in for `src/lib/docker.ts`. Tests override individual
 * functions per test and call `resetDockerStub()` in `afterEach`.
 */
export const dockerStub: typeof defaults = { ...defaults };

export function resetDockerStub() {
  Object.assign(dockerStub, defaults);
}
