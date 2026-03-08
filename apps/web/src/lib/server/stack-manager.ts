import { writeFileSync, unlinkSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { tmpdir } from "os";
import {
  execCompose,
  ensureNetwork,
  listContainers,
  type ContainerInfo,
} from "./docker";
import { connectTraefikToNetwork } from "./core-stack";

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

function writeEnvFile(envVars: Record<string, string>): string {
  const envPath = join(tmpdir(), `laber-env-${Date.now()}.env`);
  const content = Object.entries(envVars)
    .map(([k, v]) => `${k}=${v}`)
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
      writeSecretFiles(options.secretFiles);
    }

    const envArgs: string[] = [];
    if (Object.keys(options.envVars).length > 0) {
      envFilePath = writeEnvFile(options.envVars);
      envArgs.push("--env-file", envFilePath);
    }

    const command = [...envArgs, "up", "-d"].join(" ");

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
      } catch {
        // traefik may not be running yet
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
  onOutput?: (chunk: string) => void,
): Promise<DeployResult> {
  const result = await execCompose({
    composePath,
    command: "down",
    projectName,
    onOutput,
  });

  return {
    success: result.exitCode === 0,
    output: result.stdout + result.stderr,
  };
}

export async function restartStack(
  composePath: string,
  projectName?: string,
  onOutput?: (chunk: string) => void,
): Promise<DeployResult> {
  const result = await execCompose({
    composePath,
    command: "restart",
    projectName,
    onOutput,
  });

  return {
    success: result.exitCode === 0,
    output: result.stdout + result.stderr,
  };
}

export async function pullStack(
  composePath: string,
  projectName?: string,
  onOutput?: (chunk: string) => void,
): Promise<DeployResult> {
  const result = await execCompose({
    composePath,
    command: "pull",
    projectName,
    onOutput,
  });

  return {
    success: result.exitCode === 0,
    output: result.stdout + result.stderr,
  };
}

export async function getStackContainers(
  projectName: string
): Promise<ContainerInfo[]> {
  return listContainers(projectName);
}
