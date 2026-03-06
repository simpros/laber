export const CORE_KEYS = [
  {
    key: "ROOT_DOMAIN",
    label: "Root Domain",
    secret: false,
    placeholder: "yourdomain.com",
  },
  {
    key: "CF_DNS_API_TOKEN",
    label: "Cloudflare DNS API Token",
    secret: true,
    placeholder: "Your CF API token",
  },
  {
    key: "ZONE_ID",
    label: "Cloudflare Zone ID",
    secret: true,
    placeholder: "Your CF Zone ID",
  },
  {
    key: "TUNNEL_TOKEN",
    label: "Cloudflare Tunnel Token",
    secret: true,
    placeholder: "Your tunnel token",
  },
  {
    key: "ACME_EMAIL",
    label: "ACME Email",
    secret: false,
    placeholder: "admin@yourdomain.com",
  },
  {
    key: "HTTP_TIMEOUT",
    label: "HTTP Timeout",
    secret: false,
    placeholder: "60",
  },
  {
    key: "POLLING_INTERVAL",
    label: "Polling Interval",
    secret: false,
    placeholder: "10",
  },
  {
    key: "PROPAGATION_TIMEOUT",
    label: "Propagation Timeout",
    secret: false,
    placeholder: "3600",
  },
  { key: "TTL", label: "TTL", secret: false, placeholder: "300" },
  {
    key: "LOG_LEVEL",
    label: "Log Level",
    secret: false,
    placeholder: "INFO",
  },
] as const;
