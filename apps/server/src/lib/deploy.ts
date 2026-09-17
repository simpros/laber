import { writeFileSync, unlinkSync, mkdirSync, rmSync } from "fs";
import { join, dirname } from "path";
import { tmpdir } from "os";
import {
  runComposeCommand,
  ensureNetwork,
  connectTraefikToNetwork,
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
 * Single failure contract: returns the deploy output on success, throws
 * `ActionFailedError` (via `runComposeCommand`) on a nonzero exit — deploy
 * never reads exit codes itself. Freshly-written secret files are wiped via
 * `onFailure` cleanup; on success they stay (running containers mount these
 * paths). `runLoggedAction` maps the throw to the contextual failure message,
 * so the message here stays short — the transcript is already in the
 * activity stream and deployment log.
 */
export async function deployStack(
  options: DeployOptions
): Promise<{ output: string }> {
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

    // Single env channel: everything the stack needs travels via --env-file.
    // (execCompose still inherits process.env, but stack vars are no longer
    // overlaid a second time, so there is only one fact to fix.)
    // A failed deploy must not leave freshly-written secret files behind.
    const { output: base } = await runComposeCommand(
      options.composePath,
      [...envArgs, "up", "-d"],
      options.projectName,
      options.onOutput,
      {
        onFailure: () => {
          if (options.secretFiles?.length) {
            removeSecretFiles(options.secretFiles);
          }
        },
      }
    );

    let output = base;

    if (options.networkName) {
      try {
        await connectTraefikToNetwork(options.networkName);
      } catch (e) {
        const reason = e instanceof Error ? e.message : String(e);
        const warning =
          `Warning: could not attach Traefik to network ${options.networkName}: ${reason}\n`;
        options.onOutput?.(warning);
        // The deploy itself succeeded; surface the warning in the returned
        // output too so callers don't have to watch the activity stream.
        output += warning;
      }
    }

    return { output };
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
