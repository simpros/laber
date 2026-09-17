import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { mock } from "bun:test";
import { dockerStub } from "./docker-stub";

// Every test file imports this module first (before `../src/app`), so the
// temp-database env vars are set before `@laber/db` is first evaluated and
// the docker mocks are registered before `src/lib/docker-engine.ts` /
// `src/lib/compose-cli.ts` are imported.
//
// NOTE: run these tests from this package directory (e.g. `bun test` here,
// or `bun run test` at the repo root via turbo, which uses the package dir
// as cwd). The repo-root bunfig preloads the Svelte happy-dom globals, which
// shadow Response/Headers and break better-auth's Set-Cookie handling.
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
    onOutput?: (chunk: string) => void,
    options?: { onFailure?: () => void }
  ) =>
    dockerStub.runComposeCommand(
      composePath,
      command,
      projectName,
      onOutput,
      options
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
