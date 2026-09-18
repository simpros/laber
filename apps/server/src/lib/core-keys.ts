/**
 * Server catalog of core config keys (storage key, typed prop, secrecy,
 * requiredness); presentation metadata lives with the SPA so no copy can drift.
 */
export const CORE_KEYS = [
  { key: "ROOT_DOMAIN", prop: "rootDomain", secret: false, required: true },
  {
    key: "CF_DNS_API_TOKEN",
    prop: "cfDnsApiToken",
    secret: true,
    required: true,
  },
  { key: "ACME_EMAIL", prop: "acmeEmail", secret: false, required: false },
  { key: "LOG_LEVEL", prop: "logLevel", secret: false, required: false },
  { key: "TUNNEL_TOKEN", prop: "tunnelToken", secret: true, required: false },
  { key: "ZONE_ID", prop: "zoneId", secret: true, required: false },
  { key: "HTTP_TIMEOUT", prop: "httpTimeout", secret: false, required: false },
  {
    key: "POLLING_INTERVAL",
    prop: "pollingInterval",
    secret: false,
    required: false,
  },
  {
    key: "PROPAGATION_TIMEOUT",
    prop: "propagationTimeout",
    secret: false,
    required: false,
  },
  { key: "TTL", prop: "ttl", secret: false, required: false },
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
