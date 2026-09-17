import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { stringify } from "yaml";
import { listContainers, runComposeCommand } from "./docker";
import { deployStack } from "./stack-manager";
import { DATA_DIR } from "./config";

export type CoreConfig = {
  rootDomain: string;
  cfDnsApiToken: string;
  zoneId?: string;
  tunnelToken?: string;
  httpTimeout?: string;
  pollingInterval?: string;
  propagationTimeout?: string;
  ttl?: string;
  logLevel?: string;
  acmeEmail?: string;
};

type CoreServiceStatus = {
  name: string;
  status: string;
  state: string;
  image: string;
};

function getComposeDir(): string {
  const dir = join(DATA_DIR, "core");
  mkdirSync(dir, { recursive: true });
  return dir;
}

function getComposePath(): string {
  return join(getComposeDir(), "docker-compose.yaml");
}

export function buildCoreCompose(
  config: CoreConfig
): Record<string, unknown> {
  const acmeEmail = config.acmeEmail ?? `admin@${config.rootDomain}`;
  const logLevel = config.logLevel ?? "ERROR";
  const httpTimeout = config.httpTimeout ?? "180";
  const pollingInterval = config.pollingInterval ?? "30";
  const propagationTimeout = config.propagationTimeout ?? "300";
  const ttl = config.ttl ?? "1";

  const services: Record<string, unknown> = {
    "reverse-proxy": {
      image: "traefik:v3",
      container_name: "laber-reverse-proxy",
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

export function getCoreComposeContent(config: CoreConfig): string {
  return stringify(buildCoreCompose(config));
}

export async function deployCoreStack(
  config: CoreConfig,
  onOutput?: (chunk: string) => void
): Promise<{ success: boolean; output: string }> {
  const composePath = getComposePath();
  writeFileSync(composePath, getCoreComposeContent(config), "utf-8");

  const envVars: Record<string, string> = {
    CF_DNS_API_TOKEN: config.cfDnsApiToken,
  };
  if (config.tunnelToken) {
    envVars.TUNNEL_TOKEN = config.tunnelToken;
  }

  return deployStack({
    composePath,
    envVars,
    projectName: "laber-core",
    onOutput,
  });
}

export async function stopCoreStack(
  onOutput?: (chunk: string) => void
): Promise<{
  success: boolean;
  output: string;
}> {
  return runComposeCommand(
    getComposePath(),
    "down",
    "laber-core",
    onOutput
  );
}

export async function restartCoreStack(
  onOutput?: (chunk: string) => void
): Promise<{
  success: boolean;
  output: string;
}> {
  return runComposeCommand(
    getComposePath(),
    "restart",
    "laber-core",
    onOutput
  );
}

export async function getCoreStatus(): Promise<CoreServiceStatus[]> {
  const containers = await listContainers("laber-core");
  return containers.map((c) => ({
    name: c.name,
    status: c.status,
    state: c.state,
    image: c.image,
  }));
}
