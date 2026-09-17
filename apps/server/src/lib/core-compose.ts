import { stringify } from "yaml";
import type { CoreConfigShape } from "./core-keys";
import { TRAEFIK_CONTAINER, TRAEFIK_SERVICE } from "./core-identity";

/**
 * Traefik compose-template construction for the core stack. This file owns
 * the YAML-as-JS blob; `core-stack.ts` keeps config + lifecycle + overview
 * so a template tweak never collides with a config-merge fix.
 */
export function buildCoreCompose(
  config: CoreConfigShape
): Record<string, unknown> {
  const acmeEmail = config.acmeEmail ?? `admin@${config.rootDomain}`;
  const logLevel = config.logLevel ?? "ERROR";
  const httpTimeout = config.httpTimeout ?? "180";
  const pollingInterval = config.pollingInterval ?? "30";
  const propagationTimeout = config.propagationTimeout ?? "300";
  const ttl = config.ttl ?? "1";

  // The Traefik service key is the centralized `TRAEFIK_SERVICE`: discovery
  // in `docker-engine` matches on it, so a rename touches `core-identity`,
  // not the template and the engine in parallel.
  const services: Record<string, unknown> = {
    [TRAEFIK_SERVICE]: {
      image: "traefik:v3",
      container_name: TRAEFIK_CONTAINER,
      restart: "unless-stopped",
      security_opt: ["no-new-privileges:true"],
      ports: ["80:80", "443:443", "8080:8080"],
      environment: {
        CF_DNS_API_TOKEN: "${CF_DNS_API_TOKEN}",
      },
      volumes: [
        "/var/run/docker.sock:/var/run/docker.sock:ro",
        "acme:/acme",
        "traefik:/etc/traefik",
      ],
      command: [
        `--log.level=${logLevel}`,
        "--api.insecure=true",
        "--api.dashboard=true",
        "--providers.docker=true",
        "--providers.docker.exposedbydefault=false",
        "--providers.docker.network=main",
        "--providers.file.directory=/etc/traefik/dynamic",
        "--entrypoints.web.address=:80",
        "--entrypoints.web.http.redirections.entryPoint.to=websecure",
        "--entrypoints.web.http.redirections.entryPoint.scheme=https",
        "--entrypoints.websecure.address=:443",
        "--entrypoints.websecure.http.tls=true",
        "--entrypoints.websecure.http.tls.certresolver=letsencrypt",
        `--entrypoints.websecure.http.tls.domains[0].main=${config.rootDomain}`,
        `--entrypoints.websecure.http.tls.domains[0].sans=*.${config.rootDomain}`,
        "--certificatesresolvers.letsencrypt.acme.dnschallenge=true",
        "--certificatesresolvers.letsencrypt.acme.dnschallenge.provider=cloudflare",
        "--certificatesresolvers.letsencrypt.acme.dnschallenge.resolvers=1.1.1.1:53,8.8.8.8:53",
        `--certificatesresolvers.letsencrypt.acme.email=${acmeEmail}`,
        "--certificatesresolvers.letsencrypt.acme.storage=/acme/acme.json",
        "--certificatesresolvers.letsencrypt.acme.dnschallenge.delaybeforecheck=0",
        "--serversTransport.insecureSkipVerify=true",
      ],
      labels: ["traefik.enable=true"],
      networks: ["main"],
    },
  };

  if (config.tunnelToken) {
    services.tunnel = {
      image: "cloudflare/cloudflared:latest",
      container_name: "laber-tunnel",
      restart: "unless-stopped",
      command: "tunnel run",
      environment: {
        TUNNEL_TOKEN: "${TUNNEL_TOKEN}",
      },
      networks: ["main"],
    };
  }

  if (config.zoneId) {
    services["cloudflare-companion"] = {
      image:
        "ghcr.io/tiredofit/docker-traefik-cloudflare-companion:latest",
      container_name: "laber-cloudflare-companion",
      restart: "unless-stopped",
      environment: {
        CF_TOKEN: "${CF_DNS_API_TOKEN}",
        TARGET_DOMAIN: config.rootDomain,
        DOMAIN1: config.rootDomain,
        DOMAIN1_ZONE_ID: config.zoneId,
        DOMAIN1_PROXIED: "true",
        TRAEFIK_FILTER_LABEL: "proxy-public",
        DOCKER_HOST: "unix:///var/run/docker.sock",
        REFRESH_ENTRIES: "true",
        LOG_TYPE: "CONSOLE",
        CF_DNS_API_TOKEN: "${CF_DNS_API_TOKEN}",
        DNS_TTL: ttl,
        HTTP_TIMEOUT: httpTimeout,
        POLLING_INTERVAL: pollingInterval,
        PROPAGATION_TIMEOUT: propagationTimeout,
      },
      volumes: ["/var/run/docker.sock:/var/run/docker.sock:ro"],
      networks: ["main"],
    };
  }

  return {
    services,
    networks: {
      main: {
        name: "main",
        external: true,
      },
    },
    volumes: {
      acme: null,
      traefik: null,
    },
  };
}

export function getCoreComposeContent(config: CoreConfigShape): string {
  return stringify(buildCoreCompose(config));
}
