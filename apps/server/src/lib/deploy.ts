import { writeFileSync, unlinkSync, mkdirSync, rmSync } from "fs";
import { join, dirname } from "path";
import { tmpdir } from "os";
import { nanoid } from "nanoid";
import {
  runComposeCommand,
  downProject,
} from "./compose-cli";
import {
  ensureNetwork,
  connectTraefikToNetwork,
} from "./docker-engine";
import { ActionFailedError } from "./errors";
import { runLoggedAction, type ActionIdentity } from "./logged-action";

type SecretFile = {
  filePath: string;
  value: string;
};

type DeployOptions = {
  composePath: string;
  /**
   * The exact compose bytes Docker applies. `deployStack` freezes them to a
   * sibling temp file and deletes it in `finally`: validated === applied, with no live-path mode.
   */
  composeBytes: string;
  /**
   * Promote the applied bytes to the live path inside the same attempt (core
   * deploy sets it; stack deploy leaves it off), so a failed write compensates instead of leaving success drift.
   */
  commitLive?: boolean;
  envVars: Record<string, string>;
  secretFiles?: SecretFile[];
  networkName?: string;
  // Required: a failed attempt compensates via `downProject` by name.
  projectName: string;
  onOutput?: (chunk: string) => void;
};

export type { DeployOptions };

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

function removeSecretFiles(files: SecretFile[]): void {
  for (const { filePath } of files) {
    try {
      rmSync(filePath, { force: true });
    } catch {
      // best-effort cleanup
    }
  }
}

/**
 * Success means "`up -d` + Traefik attached"; any failure first wipes written
 * secrets and brings down started containers, so `"error"` never hides live state or secrets on disk.
 */
export async function deployStack(
  options: DeployOptions
): Promise<{ output: string }> {
  if (options.networkName) {
    await ensureNetwork(options.networkName);
  }

  let envFilePath: string | undefined;
  let secretsWritten = false;
  let composeUp = false;
  let snapshotPath: string | undefined;
  let composePath = options.composePath;
  const secretFiles = options.secretFiles ?? [];
  try {
    snapshotPath = `${options.composePath}.deploy-${nanoid(8)}.tmp`;
    writeFileSync(snapshotPath, options.composeBytes, "utf-8");
    composePath = snapshotPath;

    if (secretFiles.length > 0) {
      writeSecretFiles(secretFiles);
      secretsWritten = true;
    }

    const envArgs: string[] = [];
    if (Object.keys(options.envVars).length > 0) {
      envFilePath = writeEnvFile(options.envVars);
      envArgs.push("--env-file", envFilePath);
    }

    // Stack vars travel only via --env-file; the spawned process inherits
    // process.env for the docker CLI itself, with no second stack-env overlay.
    const { output: base } = await runComposeCommand(
      composePath,
      [...envArgs, "up", "-d"],
      options.projectName,
      options.onOutput
    );
    composeUp = true;

    let output = base;

    // Traefik attach is part of the success contract, not a warning: a soft
    // warning here would mark a stack live while ingress is broken.
    if (options.networkName) {
      try {
        await connectTraefikToNetwork(options.networkName);
      } catch (e) {
        const reason = e instanceof Error ? e.message : String(e);
        const detail = `Could not attach Traefik to network ${options.networkName}: ${reason}\n`;
        output += detail;
        options.onOutput?.(detail);
        throw new ActionFailedError(
          `Could not attach Traefik to network ${options.networkName}: ${reason}`
        );
      }
    }

    // Running containers mount the secret files, so they stay on success.
    if (options.commitLive) {
      writeFileSync(options.composePath, options.composeBytes, "utf-8");
    }
    secretsWritten = false;
    return { output };
  } catch (e) {
    if (secretsWritten && secretFiles.length > 0) {
      removeSecretFiles(secretFiles);
    }
    if (composeUp) {
      try {
        await downProject({
          projectName: options.projectName,
          composePath,
          onOutput: options.onOutput,
        });
      } catch (downError) {
        options.onOutput?.(
          `Deploy cleanup (down) also failed: ${downError instanceof Error ? downError.message : "unknown error"}\n`
        );
      }
    }
    throw e;
  } finally {
    if (envFilePath) {
      try {
        unlinkSync(envFilePath);
      } catch {
        // ignore cleanup errors
      }
    }
    if (snapshotPath) {
      try {
        rmSync(snapshotPath, { force: true });
      } catch {
        // best-effort snapshot cleanup; the deploy outcome is what matters.
      }
    }
  }
}

/** Logged-deploy shell for stack `deployStackByName` and `deployCore`. */
export function runLoggedDeploy(options: {
  title: string;
  action: string;
  identity: ActionIdentity;
  failureMessage?: string;
  deploy: Omit<DeployOptions, "onOutput">;
}): Promise<{ output: string }> {
  return runLoggedAction({
    title: options.title,
    action: options.action,
    identity: options.identity,
    failureMessage: options.failureMessage,
    run: async (onOutput) => {
      const result = await deployStack({ ...options.deploy, onOutput });
      return { output: result.output };
    },
  });
}
