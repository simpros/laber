import { mkdirSync } from "fs";
import { join } from "path";
import { resolveDataDir } from "@laber/db/paths";

export const CORE_PROJECT = "laber-core";
export const TRAEFIK_CONTAINER = "laber-reverse-proxy";
export const TRAEFIK_SERVICE = "reverse-proxy";
// Traefik's provider pin routes unlabelled services here; every core service
// keeps a leg on it so a shared-network stack stays reachable.
export const CORE_NETWORK = "main";

export function getCoreComposePath(): string {
  const dir = join(resolveDataDir(), "core");
  mkdirSync(dir, { recursive: true });
  return join(dir, "docker-compose.yaml");
}
