import { mkdirSync } from "fs";
import { join } from "path";
import { resolveDataDir } from "@laber/db/paths";

/**
 * The one core identity: a rename touches this file, not every consumer in parallel.
 */
export const CORE_PROJECT = "laber-core";
export const TRAEFIK_CONTAINER = "laber-reverse-proxy";
export const TRAEFIK_SERVICE = "reverse-proxy";

/** Compose file for the core project. Routes never build this path. */
export function getCoreComposePath(): string {
  const dir = join(resolveDataDir(), "core");
  mkdirSync(dir, { recursive: true });
  return join(dir, "docker-compose.yaml");
}
