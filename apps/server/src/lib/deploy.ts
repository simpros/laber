import { writeFileSync, unlinkSync, mkdirSync, rmSync } from "fs";
import { join, dirname } from "path";
import { tmpdir } from "os";
import {
  runComposeCommand,
  downProject,
} from "./compose-cli";
import {
  ensureNetwork,
  connectTraefikToNetwork,
} from "./docker-engine";
import { ActionFailedError } from "./errors";

type SecretFile = {
  filePath: string;
  value: string;
};

type DeployOptions = {
  composePath: string;
  envVars: Record<string, string>;
  secretFiles?: SecretFile[];
  networkName?: string;
  // Required (not optional): a failed attempt compensates via `downProject`
  // by name, so deploy must always know the teardown identity.
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
 * Single failure contract: returns the deploy output on success, throws
 * `ActionFailedError` (via `runComposeCommand`) on a nonzero exit — deploy
 * never reads exit codes itself. Freshly-written secret files are wiped via
 * `onFailure` cleanup; on success they stay (running containers mount these
 * paths). `runLoggedAction` maps the throw to the contextual failure message,
 * so the message here stays short — the transcript is already in the
 * activity stream and deployment log.
 *
 * One atomic success contract: success means "`up -d` + Traefik attached".
 * Any failure after this attempt wrote secrets or started containers is
 * compensated before the throw — secrets wiped, containers brought back
 * down via the same `downProject` teardown stop uses — so an `"error"`
 * status never hides running containers or secret files on disk. The
 * compensating `down` streams into the same transcript; if it also fails,
 * the original error is what throws.
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
  const secretFiles = options.secretFiles ?? [];
  try {
    if (secretFiles.length > 0) {
      // Secret paths are already absolute (resolved by extractSecrets
      // against the compose file); write them in exactly one place here.
      writeSecretFiles(secretFiles);
      secretsWritten = true;
    }

    const envArgs: string[] = [];
    if (Object.keys(options.envVars).length > 0) {
      envFilePath = writeEnvFile(options.envVars);
      envArgs.push("--env-file", envFilePath);
    }

    // Single env channel: everything the stack needs travels via --env-file.
    // (execCompose still inherits process.env, but stack vars are no longer
    // overlaid a second time, so there is only one fact to fix.)
    // A failed compose run must not leave freshly-written secret files behind.
    const { output: base } = await runComposeCommand(
      options.composePath,
      [...envArgs, "up", "-d"],
      options.projectName,
      options.onOutput,
      {
        onFailure: () => {
          if (secretFiles.length > 0) {
            removeSecretFiles(secretFiles);
          }
        },
      }
    );
    composeUp = true;

    let output = base;

    // Traefik attach is part of the deploy success contract, not a warning:
    // the product contract is "reachable via Traefik", and the stack status
    // becomes `"deployed"` on success — a soft warning here would mark a
    // stack live while ingress is broken. A failure throws, so the shared
    // status machine moves the stack to `"error"` and the transcript keeps
    // the reason (the wire message stays short by design).
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

    // Success: running containers mount the secret files, so they stay.
    secretsWritten = false;
    return { output };
  } catch (e) {
    // Compensate this attempt only: wipe secrets it wrote, bring down
    // containers it started. (`onFailure` above may already have wiped the
    // secrets on the compose-failure path; removal is idempotent.)
    if (secretsWritten && secretFiles.length > 0) {
      removeSecretFiles(secretFiles);
    }
    if (composeUp) {
      try {
        await downProject({
          projectName: options.projectName,
          composePath: options.composePath,
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
  }
}
