import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { mock } from "bun:test";
import { dockerStub } from "./docker-stub";

// Env vars and docker mocks must register before `../src/app` imports.
// Run from this package dir: repo-root happy-dom globals shadow Response/Headers and break auth cookies.
const dir = mkdtempSync(join(tmpdir(), "laber-server-test-"));
process.env.DATA_DIR = join(dir, "data");
process.env.DATABASE_PATH = join(dir, "data", "laber.db");
if (!process.env.BETTER_AUTH_SECRET) {
  process.env.BETTER_AUTH_SECRET =
    "test-secret-0123456789abcdef-test-secret-0123456789abcdef";
}
if (!process.env.BETTER_AUTH_BASE_URL) {
  process.env.BETTER_AUTH_BASE_URL = "http://localhost:3001";
}

mock.module("../src/lib/docker-engine.ts", () => ({
  listContainers: (projectLabel?: string) =>
    dockerStub.listContainers(projectLabel),
  listContainersSoft: (projectLabel?: string) =>
    dockerStub.listContainersSoft(projectLabel),
  getContainerLogs: (options: {
    containerId: string;
    tail?: number;
    since?: number;
  }) => dockerStub.getContainerLogs(options),
  followContainerLogs: (options: {
    containerId: string;
    tail?: number;
    since?: number;
  }) => dockerStub.followContainerLogs(options),
  ensureNetwork: (networkName: string) =>
    dockerStub.ensureNetwork(networkName),
  connectContainerToNetwork: (containerId: string, networkName: string) =>
    dockerStub.connectContainerToNetwork(containerId, networkName),
  connectTraefikToNetwork: (networkName: string) =>
    dockerStub.connectTraefikToNetwork(networkName),
  stopContainer: (containerId: string) =>
    dockerStub.stopContainer(containerId),
  removeContainer: (containerId: string) =>
    dockerStub.removeContainer(containerId),
}));

mock.module("../src/lib/compose-cli.ts", () => ({
  runComposeCommand: (
    composePath: string,
    command: string[],
    projectName?: string,
    onOutput?: (chunk: string) => void
  ) =>
    dockerStub.runComposeCommand(
      composePath,
      command,
      projectName,
      onOutput
    ),
  downProject: (options: {
    projectName: string;
    composePath?: string;
    onOutput?: (chunk: string) => void;
  }) => dockerStub.downProject(options),
}));

export const TEST_DATA_DIR = process.env.DATA_DIR;
export const TEST_DATABASE_PATH = process.env.DATABASE_PATH;

const { runMigrations } = await import("@laber/db");
runMigrations();
