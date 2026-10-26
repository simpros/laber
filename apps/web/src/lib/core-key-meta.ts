import type { CoreKey } from "@laber/api-client";

export type CoreKeyMeta = {
  label: string;
  placeholder?: string;
  hint?: string;
};

export type CoreKeyEntry = CoreKeyMeta & { key: CoreKey };

// Display strings only. Key membership, secrecy, and required flags live
// in the server table; this map is keyed by CoreKey so tsc fails when the
// two drift apart.
export const CORE_KEY_META: Record<CoreKey, CoreKeyMeta> = {
  ROOT_DOMAIN: {
    label: "Root Domain",
    placeholder: "yourdomain.com",
  },
  CF_DNS_API_TOKEN: {
    label: "Cloudflare DNS API Token",
  },
  ACME_EMAIL: {
    label: "ACME Email",
    placeholder: "admin@yourdomain.com",
  },
  LOG_LEVEL: {
    label: "Log Level",
    placeholder: "INFO",
  },
  EXTRA_NETWORKS: {
    label: "Extra Networks",
    placeholder: "auth, monitor",
    hint:
      "Comma-separated Docker networks Traefik should join. Add one per " +
      "isolated stack network whose services pin traefik.docker.network; " +
      "leave empty when sharing main is fine.",
  },
  TUNNEL_TOKEN: {
    label: "Tunnel Token",
  },
  ZONE_ID: {
    label: "Zone ID",
  },
  HTTP_TIMEOUT: {
    label: "HTTP Timeout",
    placeholder: "60",
  },
  POLLING_INTERVAL: {
    label: "Polling Interval",
    placeholder: "10",
  },
  PROPAGATION_TIMEOUT: {
    label: "Propagation Timeout",
    placeholder: "3600",
  },
  TTL: {
    label: "TTL",
    placeholder: "300",
  },
};

type CoreKeySection = {
  id: string;
  label: string;
  optional: boolean;
  keys: CoreKeyEntry[];
};

const section = (
  id: string,
  label: string,
  optional: boolean,
  keys: CoreKey[]
): CoreKeySection => ({
  id,
  label,
  optional,
  keys: keys.map((key) => ({ key, ...CORE_KEY_META[key] })),
});

// Sections own their ordered keys; render order is explicit data here,
// not object-literal insertion order.
export const CORE_KEY_SECTIONS: CoreKeySection[] = [
  section("proxy", "Reverse Proxy", false, [
    "ROOT_DOMAIN",
    "CF_DNS_API_TOKEN",
    "ACME_EMAIL",
    "LOG_LEVEL",
    "EXTRA_NETWORKS",
  ]),
  section("tunnel", "Cloudflare Tunnel", true, ["TUNNEL_TOKEN"]),
  section("companion", "Cloudflare Companion", true, [
    "ZONE_ID",
    "HTTP_TIMEOUT",
    "POLLING_INTERVAL",
    "PROPAGATION_TIMEOUT",
    "TTL",
  ]),
];

export const CORE_KEY_ENTRIES: CoreKeyEntry[] = CORE_KEY_SECTIONS.flatMap(
  (s) => s.keys
);
