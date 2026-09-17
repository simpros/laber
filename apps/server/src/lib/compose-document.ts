import { readFileSync } from "fs";
import { dirname, isAbsolute, resolve } from "path";
import * as v from "valibot";
import { parse } from "yaml";
import { ValidationError } from "./errors";

/**
 * The one compose parse every path shares (detail, deploy, save): a single
 * envelope with `services` required and `networks`/`secrets` optional. Each
 * extractor narrows only the slice it reads, so there is no central `as`
 * cast pretending the whole document is typed — and no second schema that
 * strips keys another consumer needs.
 */
export type ComposeService = Record<string, unknown>;

export type ComposeDocument = {
  services: Record<string, ComposeService>;
  networks?: Record<string, Record<string, unknown>>;
  secrets?: Record<string, Record<string, unknown>>;
};

const serviceRecord = v.record(v.string(), v.unknown());

const composeDocumentSchema = v.object({
  services: v.record(v.string(), serviceRecord),
  networks: v.optional(v.record(v.string(), serviceRecord)),
  secrets: v.optional(v.record(v.string(), serviceRecord)),
});

export function parseComposeDocument(content: string): ComposeDocument {
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
  return result.output;
}

export function readComposeFile(filePath: string): {
  raw: string;
  doc: ComposeDocument;
} {
  const raw = readFileSync(filePath, "utf-8");
  return { raw, doc: parseComposeDocument(raw) };
}

export type ServiceInfo = {
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

export function extractEnvVarNames(env: unknown): string[] {
  if (env === undefined) return [];
  const varPattern = /\$\{?([A-Z_][A-Z0-9_]*)}?/g;
  const names = new Set<string>();

  let values: unknown[];
  if (Array.isArray(env)) {
    values = env;
  } else if (typeof env === "object" && env !== null) {
    values = Object.values(env);
  } else {
    return [];
  }

  for (const val of values) {
    if (typeof val !== "string") continue;
    let match: RegExpExecArray | null;
    while ((match = varPattern.exec(val)) !== null) {
      names.add(match[1]);
    }
  }

  return [...names];
}

function stringField(
  svc: ComposeService,
  key: string
): string | undefined {
  const value = svc[key];
  return typeof value === "string" ? value : undefined;
}

function parsePorts(
  ports: unknown
): Array<{ host?: number; container: number }> {
  if (!ports || !Array.isArray(ports)) return [];
  const out: Array<{ host?: number; container: number }> = [];
  for (const entry of ports) {
    // Long-form `ports:` objects ({ target, published }) have no short
    // string to split: read the fields directly instead of String(entry).
    if (typeof entry === "object" && entry !== null) {
      const target = Number(
        (entry as Record<string, unknown>).target
      );
      if (!Number.isFinite(target)) continue;
      const published = Number(
        (entry as Record<string, unknown>).published
      );
      out.push(
        Number.isFinite(published) && published !== 0
          ? { host: published, container: target }
          : { container: target }
      );
      continue;
    }
    const parts = entry.toString().split(":");
    if (parts.length >= 2) {
      const container = parseInt(parts[1].split("/")[0], 10);
      if (!Number.isFinite(container)) continue;
      out.push({
        host: parseInt(parts[0], 10) || undefined,
        container,
      });
    } else {
      const container = parseInt(parts[0].split("/")[0], 10);
      if (!Number.isFinite(container)) continue;
      out.push({ container });
    }
  }
  return out;
}

function normalizeLabels(labels: unknown): Record<string, string> {
  if (!labels) return {};
  if (Array.isArray(labels)) {
    const result: Record<string, string> = {};
    for (const l of labels) {
      if (typeof l !== "string") continue;
      const idx = l.indexOf("=");
      if (idx !== -1) {
        result[l.slice(0, idx)] = l.slice(idx + 1);
      }
    }
    return result;
  }
  if (typeof labels === "object") {
    const result: Record<string, string> = {};
    for (const [k, value] of Object.entries(labels)) {
      if (typeof value === "string") result[k] = value;
    }
    return result;
  }
  return {};
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

export function extractServices(doc: ComposeDocument): ServiceInfo[] {
  return Object.entries(doc.services).map(([name, svc]) => {
    const labels = normalizeLabels(svc.labels);
    return {
      name,
      image: stringField(svc, "image") ?? "",
      containerName: stringField(svc, "container_name"),
      ports: parsePorts(svc.ports),
      envVars: extractEnvVarNames(svc.environment),
      traefikRoute: extractTraefikFromLabels(labels),
    };
  });
}

export function extractAllEnvVarNames(doc: ComposeDocument): string[] {
  const allNames = new Set<string>();
  for (const svc of Object.values(doc.services)) {
    for (const name of extractEnvVarNames(svc.environment)) {
      allNames.add(name);
    }
  }
  return [...allNames];
}

export function extractNetworkName(doc: ComposeDocument): string | undefined {
  if (!doc.networks) return undefined;

  for (const net of Object.values(doc.networks)) {
    if (
      net.external === true &&
      typeof net.name === "string" &&
      net.name !== ""
    ) {
      return net.name;
    }
  }

  const defaultNet = doc.networks.default;
  if (
    defaultNet?.external === true &&
    typeof defaultNet.name === "string" &&
    defaultNet.name !== ""
  ) {
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
  doc: ComposeDocument,
  composePath: string
): SecretDefinition[] {
  if (!doc.secrets) return [];

  const serviceMap = new Map<string, string[]>();
  for (const [svcName, svc] of Object.entries(doc.services ?? {})) {
    const refs = svc.secrets;
    // Service `secrets:` entries are names here; long-form objects have no
    // file to resolve, so they are skipped instead of crashing the deploy.
    if (!Array.isArray(refs)) continue;
    for (const ref of refs) {
      if (typeof ref !== "string") continue;
      const list = serviceMap.get(ref) ?? [];
      list.push(svcName);
      serviceMap.set(ref, list);
    }
  }

  const out: SecretDefinition[] = [];
  for (const [name, def] of Object.entries(doc.secrets)) {
    const file = def.file;
    if (typeof file !== "string" || file === "") continue;
    out.push({
      name,
      filePath: isAbsolute(file)
        ? file
        : resolve(dirname(composePath), file),
      services: serviceMap.get(name) ?? [],
    });
  }
  return out;
}
