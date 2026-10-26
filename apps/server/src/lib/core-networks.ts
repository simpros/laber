import { ValidationError } from "./errors";
import { CORE_NETWORK } from "./core-identity";

// Docker accepts more characters, but these are the ones compose can declare
// as external names without ambiguity in YAML or CLI arguments.
const VALID_NETWORK_NAME = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/;

// Declaring these external either conflicts with port publishing or attaches
// Traefik to a namespace Docker owns.
const RESERVED_NETWORKS = new Set(["bridge", "default", "host", "none"]);

function networkNameError(name: string): string | undefined {
  if (RESERVED_NETWORKS.has(name)) return "reserved by Docker";
  if (name.length < 2) return "use at least two characters";
  if (!VALID_NETWORK_NAME.test(name)) {
    return "use letters, digits, dots, dashes or underscores";
  }
  return undefined;
}

function splitNetworks(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((raw) => raw.trim())
    .filter((name) => name !== "");
}

// Validation runs at the config boundaries (load/save), never in the renderer.
export function assertExtraNetworks(value: string | undefined): void {
  for (const name of splitNetworks(value)) {
    const problem = networkNameError(name);
    if (problem) {
      throw new ValidationError(
        `Invalid network name "${name}": ${problem}`
      );
    }
  }
}

// Total by design: building a compose document must not throw on user data.
export function parseExtraNetworks(value: string | undefined): string[] {
  const names: string[] = [];
  for (const name of splitNetworks(value)) {
    if (name === CORE_NETWORK || names.includes(name)) continue;
    names.push(name);
  }
  return names;
}

export function formatExtraNetworks(names: readonly string[]): string {
  return names.join(", ");
}
