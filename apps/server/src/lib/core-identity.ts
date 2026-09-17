import { mkdirSync } from "fs";
import { join } from "path";
import { resolveDataDir } from "@laber/db/paths";

/**
 * The one core identity: compose project, Traefik container, and Traefik
 * service names. Every module that names the core project or discovers
 * Traefik imports these — a rename touches one file, not the template,
 * engine, and actions in parallel.
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
