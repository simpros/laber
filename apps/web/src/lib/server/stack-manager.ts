import { writeFileSync, unlinkSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { tmpdir } from "os";
import {
  execCompose,
  ensureNetwork,
  listContainers,
  runComposeCommand,
  connectTraefikToNetwork,
  type ContainerInfo,
} from "./docker";

type SecretFile = {
  filePath: string;
  value: string;
};

type DeployOptions = {
  composePath: string;
  envVars: Record<string, string>;
  secretFiles?: SecretFile[];
  networkName?: string;
  projectName?: string;
  onOutput?: (chunk: string) => void;
};

type DeployResult = {
  success: boolean;
  output: string;
};

export function escapeEnvValue(value: string): string {
  if (!/[\s#"'\\]/.test(value)) return value;
  return `"${value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t")}"`;
}

function writeEnvFile(envVars: Record<string, string>): string {
  const envPath = join(tmpdir(), `laber-env-${Date.now()}.env`);
  const content = Object.entries(envVars)
    .map(([k, v]) => `${k}=${escapeEnvValue(v)}`)
    .join("\n");
  writeFileSync(envPath, content, { encoding: "utf-8", mode: 0o600 });
  return envPath;
}

function writeSecretFiles(files: SecretFile[]): void {
  for (const { filePath, value } of files) {
    mkdirSync(dirname(filePath), { recursive: true, mode: 0o700 });
    writeFileSync(filePath, value, { encoding: "utf-8", mode: 0o600 });
  }
}

export async function deployStack(
  options: DeployOptions
): Promise<DeployResult> {
  if (options.networkName) {
    await ensureNetwork(options.networkName);
  }

  let envFilePath: string | undefined;
  try {
    if (options.secretFiles?.length) {
      // Secret paths are already absolute (resolved by extractSecrets
      // against the compose file); write them in exactly one place here.
      writeSecretFiles(options.secretFiles);
    }

    const envArgs: string[] = [];
    if (Object.keys(options.envVars).length > 0) {
      envFilePath = writeEnvFile(options.envVars);
      envArgs.push("--env-file", envFilePath);
    }

    const command = [...envArgs, "up", "-d"];

    const result = await execCompose({
      composePath: options.composePath,
      command,
      envVars: options.envVars,
      projectName: options.projectName,
      onOutput: options.onOutput,
    });

    if (result.exitCode === 0 && options.networkName) {
      try {
        await connectTraefikToNetwork(options.networkName);
      } catch (e) {
        const reason = e instanceof Error ? e.message : String(e);
        options.onOutput?.(
          `Warning: could not attach Traefik to network ${options.networkName}: ${reason}\n`
        );
      }
    }

    return {
      success: result.exitCode === 0,
      output: result.stdout + result.stderr,
    };
  } finally {
    if (envFilePath) {
      try {
        unlinkSync(envFilePath);
      } catch {
        // ignore cleanup errors
      }
    }
  }
}

export async function stopStack(
  composePath: string,
  projectName?: string,
  onOutput?: (chunk: string) => void
): Promise<DeployResult> {
  return runComposeCommand(composePath, ["down"], projectName, onOutput);
}

export async function restartStack(
  composePath: string,
  projectName?: string,
  onOutput?: (chunk: string) => void
): Promise<DeployResult> {
  return runComposeCommand(
    composePath,
    ["restart"],
    projectName,
    onOutput
  );
}

export async function pullStack(
  composePath: string,
  projectName?: string,
  onOutput?: (chunk: string) => void
): Promise<DeployResult> {
  return runComposeCommand(composePath, ["pull"], projectName, onOutput);
}

export async function getStackContainers(
  projectName: string
): Promise<ContainerInfo[]> {
  return listContainers(projectName);
}
