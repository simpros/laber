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
    placeholder: "Your CF API token",
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
    key: "TUNNEL_TOKEN",
    prop: "tunnelToken",
    label: "Tunnel Token",
    secret: true,
    required: false,
    placeholder: "Your tunnel token",
    group: "tunnel",
  },
  {
    key: "ZONE_ID",
    prop: "zoneId",
    label: "Zone ID",
    secret: true,
    required: false,
    placeholder: "Your CF Zone ID",
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
] as const;

export type CoreKey = (typeof CORE_KEYS)[number]["key"];
export type CoreConfigProp = (typeof CORE_KEYS)[number]["prop"];

type RequiredProps = Extract<
  (typeof CORE_KEYS)[number],
  { required: true }
>["prop"];
type OptionalProps = Exclude<CoreConfigProp, RequiredProps>;

export type CoreConfigShape = Record<RequiredProps, string> &
  Partial<Record<OptionalProps, string>>;

export const REQUIRED_CORE_KEYS = CORE_KEYS.filter((k) => k.required).map(
  (k) => k.key
) as string[];

export function corePropForKey(key: string): CoreConfigProp | undefined {
  return CORE_KEYS.find((k) => k.key === key)?.prop;
}
