import { writeFileSync, unlinkSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  execCompose,
  ensureNetwork,
  listContainers,
  type ContainerInfo,
} from "./docker";
import { connectTraefikToNetwork } from "./core-stack";

type DeployOptions = {
  composePath: string;
  envVars: Record<string, string>;
  networkName?: string;
  projectName?: string;
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
  writeFileSync(envPath, content, "utf-8");
  return envPath;
}

export async function deployStack(
  options: DeployOptions
): Promise<DeployResult> {
  if (options.networkName) {
    await ensureNetwork(options.networkName);
  }

  let envFilePath: string | undefined;
  try {
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
  projectName?: string
): Promise<DeployResult> {
  const result = await execCompose({
    composePath,
    command: "down",
    projectName,
  });

  return {
    success: result.exitCode === 0,
    output: result.stdout + result.stderr,
  };
}

export async function restartStack(
  composePath: string,
  projectName?: string
): Promise<DeployResult> {
  const result = await execCompose({
    composePath,
    command: "restart",
    projectName,
  });

  return {
    success: result.exitCode === 0,
    output: result.stdout + result.stderr,
  };
}

export async function pullStack(
  composePath: string,
  projectName?: string
): Promise<DeployResult> {
  const result = await execCompose({
    composePath,
    command: "pull",
    projectName,
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
