export type CoreKeyGroup = "proxy" | "tunnel" | "companion";

export const CORE_KEY_GROUPS: Record<
  CoreKeyGroup,
  { label: string; optional: boolean }
> = {
  proxy: { label: "Reverse Proxy", optional: false },
  tunnel: { label: "Cloudflare Tunnel", optional: true },
  companion: { label: "Cloudflare Companion", optional: true },
};

type CoreKeyBase = {
  key: string;
  prop: string;
  label: string;
  required: boolean;
  group: CoreKeyGroup;
  hint?: string;
};

export type CoreKeyEntry =
  | (CoreKeyBase & { secret: false; placeholder: string })
  | (CoreKeyBase & { secret: true; placeholder?: never });

// Placeholder is plain-only by construction; secret keys resolve to none.
export function coreKeyPlaceholder(key: CoreKeyEntry): string | undefined {
  return key.secret ? undefined : key.placeholder;
}

export const CORE_KEYS = [
  {
    key: "ROOT_DOMAIN",
    prop: "rootDomain",
    label: "Root Domain",
    secret: false,
    required: true,
    placeholder: "yourdomain.com",
    group: "proxy",
  },
  {
    key: "CF_DNS_API_TOKEN",
    prop: "cfDnsApiToken",
    label: "Cloudflare DNS API Token",
    secret: true,
    required: true,
    group: "proxy",
  },
  {
    key: "ACME_EMAIL",
    prop: "acmeEmail",
    label: "ACME Email",
    secret: false,
    required: false,
    placeholder: "admin@yourdomain.com",
    group: "proxy",
  },
  {
    key: "LOG_LEVEL",
    prop: "logLevel",
    label: "Log Level",
    secret: false,
    required: false,
    placeholder: "INFO",
    group: "proxy",
  },
  {
    key: "EXTRA_NETWORKS",
    prop: "extraNetworks",
    label: "Extra Networks",
    secret: false,
    required: false,
    placeholder: "auth, monitor",
    group: "proxy",
    hint:
      "Comma-separated Docker networks Traefik should join. Add one per " +
      "isolated stack network whose services pin traefik.docker.network; " +
      "leave empty when sharing main is fine.",
  },
  {
    key: "TUNNEL_TOKEN",
    prop: "tunnelToken",
    label: "Tunnel Token",
    secret: true,
    required: false,
    group: "tunnel",
  },
  {
    key: "ZONE_ID",
    prop: "zoneId",
    label: "Zone ID",
    secret: true,
    required: false,
    group: "companion",
  },
  {
    key: "HTTP_TIMEOUT",
    prop: "httpTimeout",
    label: "HTTP Timeout",
    secret: false,
    required: false,
    placeholder: "60",
    group: "companion",
  },
  {
    key: "POLLING_INTERVAL",
    prop: "pollingInterval",
    label: "Polling Interval",
    secret: false,
    required: false,
    placeholder: "10",
    group: "companion",
  },
  {
    key: "PROPAGATION_TIMEOUT",
    prop: "propagationTimeout",
    label: "Propagation Timeout",
    secret: false,
    required: false,
    placeholder: "3600",
    group: "companion",
  },
  {
    key: "TTL",
    prop: "ttl",
    label: "TTL",
    secret: false,
    required: false,
    placeholder: "300",
    group: "companion",
  },
] as const satisfies readonly CoreKeyEntry[];

export type CoreKey = (typeof CORE_KEYS)[number]["key"];
export type CoreConfigProp = (typeof CORE_KEYS)[number]["prop"];
