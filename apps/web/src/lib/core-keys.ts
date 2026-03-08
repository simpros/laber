export type CoreKeyGroup = "proxy" | "tunnel" | "companion";

export const CORE_KEY_GROUPS: Record<
  CoreKeyGroup,
  { label: string; optional: boolean }
> = {
  proxy: { label: "Reverse Proxy", optional: false },
  tunnel: { label: "Cloudflare Tunnel", optional: true },
  companion: { label: "Cloudflare Companion", optional: true },
};

export const CORE_KEYS = [
  {
    key: "ROOT_DOMAIN",
    label: "Root Domain",
    secret: false,
    placeholder: "yourdomain.com",
    group: "proxy",
  },
  {
    key: "CF_DNS_API_TOKEN",
    label: "Cloudflare DNS API Token",
    secret: true,
    placeholder: "Your CF API token",
    group: "proxy",
  },
  {
    key: "ACME_EMAIL",
    label: "ACME Email",
    secret: false,
    placeholder: "admin@yourdomain.com",
    group: "proxy",
  },
  {
    key: "LOG_LEVEL",
    label: "Log Level",
    secret: false,
    placeholder: "INFO",
    group: "proxy",
  },
  {
    key: "TUNNEL_TOKEN",
    label: "Tunnel Token",
    secret: true,
    placeholder: "Your tunnel token",
    group: "tunnel",
  },
  {
    key: "ZONE_ID",
    label: "Zone ID",
    secret: true,
    placeholder: "Your CF Zone ID",
    group: "companion",
  },
  {
    key: "HTTP_TIMEOUT",
    label: "HTTP Timeout",
    secret: false,
    placeholder: "60",
    group: "companion",
  },
  {
    key: "POLLING_INTERVAL",
    label: "Polling Interval",
    secret: false,
    placeholder: "10",
    group: "companion",
  },
  {
    key: "PROPAGATION_TIMEOUT",
    label: "Propagation Timeout",
    secret: false,
    placeholder: "3600",
    group: "companion",
  },
  { key: "TTL", label: "TTL", secret: false, placeholder: "300", group: "companion" },
] as const;
