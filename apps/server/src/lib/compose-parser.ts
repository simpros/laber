import { readFileSync } from "fs";
import { dirname, isAbsolute, resolve } from "path";
import * as v from "valibot";
import { parse } from "yaml";
import { ValidationError } from "./errors";

type ComposeSecretDef = {
  file?: string;
  environment?: string;
  external?: boolean;
};

type ComposeFile = {
  services: Record<string, ComposeService>;
  networks?: Record<string, ComposeNetwork>;
  volumes?: Record<string, unknown>;
  secrets?: Record<string, ComposeSecretDef>;
};

type ComposeService = {
  image?: string;
  container_name?: string;
  environment?: string[] | Record<string, string>;
  labels?: string[] | Record<string, string>;
  ports?: string[];
  volumes?: string[];
  restart?: string;
  networks?: string[] | Record<string, unknown>;
  secrets?: string[];
  [key: string]: unknown;
};

type ComposeNetwork = {
  name?: string;
  external?: boolean;
};

export type { ComposeFile, ComposeService, ComposeNetwork };

// Load-bearing shape gate: the document must be an object with a `services`
// mapping. Everything below that is narrowed field-by-field so exotic but
// valid compose files (numeric ports, non-string env values, extension
// fields) keep working exactly as they did under the old blind cast.
const composeDocumentSchema = v.object({
  services: v.record(v.string(), v.unknown()),
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.map((entry) => String(entry));
}

function asStringRecord(value: unknown): Record<string, string> | undefined {
  if (!isRecord(value)) return undefined;
  const out: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === "string") out[key] = entry;
    else if (entry !== undefined && entry !== null) out[key] = String(entry);
  }
  return out;
}

function toComposeService(raw: unknown): ComposeService {
  if (!isRecord(raw)) {
    throw new ValidationError(
      "Invalid compose file: every service must be a mapping"
    );
  }
  const svc: ComposeService = {};
  // Preserve extension fields (deploy, build, ...) via the index signature.
  for (const [key, value] of Object.entries(raw)) svc[key] = value;
  const image = asString(raw.image);
  if (image !== undefined) svc.image = image;
  else delete svc.image;
  const containerName = asString(raw.container_name);
  if (containerName !== undefined) svc.container_name = containerName;
  else delete svc.container_name;
  const environment = Array.isArray(raw.environment)
    ? asStringArray(raw.environment)
    : asStringRecord(raw.environment);
  if (environment !== undefined) svc.environment = environment;
  else delete svc.environment;
  const labels = Array.isArray(raw.labels)
    ? asStringArray(raw.labels)
    : asStringRecord(raw.labels);
  if (labels !== undefined) svc.labels = labels;
  else delete svc.labels;
  for (const key of ["ports", "volumes", "secrets"] as const) {
    const list = asStringArray(raw[key]);
    if (list !== undefined) svc[key] = list;
    else delete svc[key];
  }
  const restart = asString(raw.restart);
  if (restart !== undefined) svc.restart = restart;
  else delete svc.restart;
  const networks = Array.isArray(raw.networks)
    ? asStringArray(raw.networks)
    : isRecord(raw.networks)
      ? raw.networks
      : undefined;
  if (networks !== undefined) svc.networks = networks;
  else delete svc.networks;
  return svc;
}

function toComposeNetwork(raw: unknown): ComposeNetwork {
  if (!isRecord(raw)) return {};
  const net: ComposeNetwork = {};
  const name = asString(raw.name);
  if (name !== undefined) net.name = name;
  if (typeof raw.external === "boolean") net.external = raw.external;
  return net;
}

function toComposeSecretDef(raw: unknown): ComposeSecretDef | undefined {
  if (!isRecord(raw)) return undefined;
  const def: ComposeSecretDef = {};
  const file = asString(raw.file);
  if (file !== undefined) def.file = file;
  const environment = asString(raw.environment);
  if (environment !== undefined) def.environment = environment;
  if (typeof raw.external === "boolean") def.external = raw.external;
  return def;
}

type ServiceInfo = {
  name: string;
  image: string;
  containerName?: string;
  ports: Array<{ host?: number; container: number }>;
  envVars: string[];
  traefikRoute?: {
    subdomain: string;
    port: number;
    routerName: string;
  };
};

export function parseComposeContent(content: string): ComposeFile {
  let parsed: unknown;
  try {
    parsed = parse(content);
  } catch (e) {
    throw new ValidationError(
      `Invalid compose file: ${e instanceof Error ? e.message : "unknown error"}`
    );
  }
  const result = v.safeParse(composeDocumentSchema, parsed);
  if (!result.success) {
    throw new ValidationError(
      "Invalid compose file: missing 'services' section"
    );
  }
  const services: Record<string, ComposeService> = {};
  for (const [name, raw] of Object.entries(result.output.services)) {
    services[name] = toComposeService(raw);
  }
  const compose: ComposeFile = { services };
  if (isRecord(parsed) && isRecord(parsed.networks)) {
    const networks: Record<string, ComposeNetwork> = {};
    for (const [name, raw] of Object.entries(parsed.networks)) {
      networks[name] = toComposeNetwork(raw);
    }
    compose.networks = networks;
  }
  if (isRecord(parsed) && isRecord(parsed.volumes)) {
    compose.volumes = parsed.volumes;
  }
  if (isRecord(parsed) && isRecord(parsed.secrets)) {
    const secrets: Record<string, ComposeSecretDef> = {};
    for (const [name, raw] of Object.entries(parsed.secrets)) {
      const def = toComposeSecretDef(raw);
      if (def !== undefined) secrets[name] = def;
    }
    compose.secrets = secrets;
  }
  return compose;
}

export type ParsedComposeFile = {
  raw: string;
  compose: ComposeFile;
};

export function readComposeFile(filePath: string): ParsedComposeFile {
  const raw = readFileSync(filePath, "utf-8");
  return { raw, compose: parseComposeContent(raw) };
}

export function parseComposeFile(filePath: string): ComposeFile {
  return readComposeFile(filePath).compose;
}

export function extractEnvVarNames(
  env: string[] | Record<string, string> | undefined
): string[] {
  if (!env) return [];
  const varPattern = /\$\{?([A-Z_][A-Z0-9_]*)}?/g;
  const names = new Set<string>();

  const values: string[] = Array.isArray(env) ? env : Object.values(env);

  for (const val of values) {
    let match: RegExpExecArray | null;
    while ((match = varPattern.exec(val)) !== null) {
      names.add(match[1]);
    }
  }

  return [...names];
}

function parsePorts(
  ports: string[] | undefined
): Array<{ host?: number; container: number }> {
  if (!ports) return [];
  return ports.map((p) => {
    const parts = p.toString().split(":");
    if (parts.length >= 2) {
      return {
        host: parseInt(parts[0], 10) || undefined,
        container: parseInt(parts[1].split("/")[0], 10),
      };
    }
    return {
      container: parseInt(parts[0].split("/")[0], 10),
    };
  });
}

function normalizeLabels(
  labels: string[] | Record<string, string> | undefined
): Record<string, string> {
  if (!labels) return {};
  if (Array.isArray(labels)) {
    const result: Record<string, string> = {};
    for (const l of labels) {
      const idx = l.indexOf("=");
      if (idx !== -1) {
        result[l.slice(0, idx)] = l.slice(idx + 1);
      }
    }
    return result;
  }
  return labels;
}

function extractTraefikFromLabels(
  labels: Record<string, string>
): ServiceInfo["traefikRoute"] | undefined {
  const ruleKey = Object.keys(labels).find(
    (k) => k.match(/^traefik\.http\.routers\..+\.rule$/) !== null
  );
  if (!ruleKey) return undefined;

  const routerName = ruleKey.split(".")[3];
  const rule = labels[ruleKey];

  const hostMatch = rule.match(/Host\(`([^`]+)`\)/);
  const subdomain = hostMatch?.[1]?.split(".")[0] ?? "";

  const portKey = Object.keys(labels).find(
    (k) =>
      k.match(
        /^traefik\.http\.services\..+\.loadbalancer\.server\.port$/
      ) !== null
  );
  const port = portKey ? parseInt(labels[portKey], 10) : 0;

  return { subdomain, port, routerName };
}

export function extractServices(compose: ComposeFile): ServiceInfo[] {
  return Object.entries(compose.services).map(([name, svc]) => {
    const labels = normalizeLabels(svc.labels);
    return {
      name,
      image: svc.image ?? "",
      containerName: svc.container_name,
      ports: parsePorts(svc.ports),
      envVars: extractEnvVarNames(svc.environment),
      traefikRoute: extractTraefikFromLabels(labels),
    };
  });
}

export function extractAllEnvVarNames(compose: ComposeFile): string[] {
  const allNames = new Set<string>();
  for (const svc of Object.values(compose.services)) {
    for (const name of extractEnvVarNames(svc.environment)) {
      allNames.add(name);
    }
  }
  return [...allNames];
}

export function extractNetworkName(
  compose: ComposeFile
): string | undefined {
  if (!compose.networks) return undefined;

  for (const [, net] of Object.entries(compose.networks)) {
    if (net.external && net.name) return net.name;
  }

  const defaultNet = compose.networks.default;
  if (defaultNet?.name && defaultNet?.external) {
    return defaultNet.name;
  }

  return undefined;
}

export type SecretDefinition = {
  name: string;
  filePath: string;
  services: string[];
};

export function extractSecrets(
  compose: ComposeFile,
  composePath: string
): SecretDefinition[] {
  if (!compose.secrets) return [];

  const serviceMap = new Map<string, string[]>();
  for (const [svcName, svc] of Object.entries(compose.services)) {
    if (!svc.secrets) continue;
    for (const secretName of svc.secrets) {
      const list = serviceMap.get(secretName) ?? [];
      list.push(svcName);
      serviceMap.set(secretName, list);
    }
  }

  return Object.entries(compose.secrets)
    .filter(([, def]) => def.file)
    .map(([name, def]) => ({
      name,
      filePath: !isAbsolute(def.file!)
        ? resolve(dirname(composePath), def.file!)
        : def.file!,
      services: serviceMap.get(name) ?? [],
    }));
}
