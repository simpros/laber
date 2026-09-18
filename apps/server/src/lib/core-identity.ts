import { mkdirSync } from "fs";
import { join } from "path";
import { resolveDataDir } from "@laber/db/paths";

export const CORE_PROJECT = "laber-core";
export const TRAEFIK_CONTAINER = "laber-reverse-proxy";
export const TRAEFIK_SERVICE = "reverse-proxy";

export function getCoreComposePath(): string {
  const dir = join(resolveDataDir(), "core");
  mkdirSync(dir, { recursive: true });
  return join(dir, "docker-compose.yaml");
}
