import type { CoreKey } from "@laber/api-client";

export type CoreKeyGroup = "proxy" | "tunnel" | "companion";

export const CORE_KEY_GROUPS: Record<
  CoreKeyGroup,
  { label: string; optional: boolean }
> = {
  proxy: { label: "Reverse Proxy", optional: false },
  tunnel: { label: "Cloudflare Tunnel", optional: true },
  companion: { label: "Cloudflare Companion", optional: true },
};

export type CoreKeyMeta = {
  label: string;
  placeholder?: string;
  group: CoreKeyGroup;
  hint?: string;
};

// Display strings only. Key membership, secrecy, and required flags live
// in the server table; this map is keyed by CoreKey so tsc fails when the
// two drift apart.
export const CORE_KEY_META: Record<CoreKey, CoreKeyMeta> = {
  ROOT_DOMAIN: {
    label: "Root Domain",
    placeholder: "yourdomain.com",
    group: "proxy",
  },
  CF_DNS_API_TOKEN: {
    label: "Cloudflare DNS API Token",
    group: "proxy",
  },
  ACME_EMAIL: {
    label: "ACME Email",
    placeholder: "admin@yourdomain.com",
    group: "proxy",
  },
  LOG_LEVEL: {
    label: "Log Level",
    placeholder: "INFO",
    group: "proxy",
  },
  EXTRA_NETWORKS: {
    label: "Extra Networks",
    placeholder: "auth, monitor",
    group: "proxy",
    hint:
      "Comma-separated Docker networks Traefik should join. Add one per " +
      "isolated stack network whose services pin traefik.docker.network; " +
      "leave empty when sharing main is fine.",
  },
  TUNNEL_TOKEN: {
    label: "Tunnel Token",
    group: "tunnel",
  },
  ZONE_ID: {
    label: "Zone ID",
    group: "companion",
  },
  HTTP_TIMEOUT: {
    label: "HTTP Timeout",
    placeholder: "60",
    group: "companion",
  },
  POLLING_INTERVAL: {
    label: "Polling Interval",
    placeholder: "10",
    group: "companion",
  },
  PROPAGATION_TIMEOUT: {
    label: "Propagation Timeout",
    placeholder: "3600",
    group: "companion",
  },
  TTL: {
    label: "TTL",
    placeholder: "300",
    group: "companion",
  },
};
