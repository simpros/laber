import { ValidationError } from "./errors";

// Traefik's provider pin routes unlabelled services here; every core service
// keeps a leg on it so a shared-network stack stays reachable.
export const CORE_NETWORK = "main";

// Docker accepts more characters, but these are the ones compose can declare
// as external names without ambiguity in YAML or CLI arguments.
const VALID_NETWORK_NAME = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/;

export function normalizeExtraNetworks(
  values: readonly string[]
): string[] {
  const extra: string[] = [];
  for (const raw of values) {
    const name = raw.trim();
    if (name === "" || name === CORE_NETWORK) continue;
    if (!VALID_NETWORK_NAME.test(name)) {
      throw new ValidationError(
        `Invalid network name "${name}": use letters, digits, dots, dashes or underscores`
      );
    }
    if (!extra.includes(name)) extra.push(name);
  }
  return extra;
}

export function parseExtraNetworks(value: string | undefined): string[] {
  return normalizeExtraNetworks((value ?? "").split(","));
}

export function formatExtraNetworks(networks: readonly string[]): string {
  return networks.join(", ");
}
