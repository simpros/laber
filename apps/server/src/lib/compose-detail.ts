import { readFileSync } from "fs";
import * as v from "valibot";
import { parse } from "yaml";
import { ValidationError } from "./errors";

/**
 * Detail-side compose view: services, env references, Traefik routes, raw
 * text. Validates only the services mapping it actually reads — every field
 * below that is narrowed locally at each extractor, so there is no central
 * `as ComposeFile` cast pretending the whole document is typed.
 */
export type DetailService = Record<string, unknown>;

export type DetailDoc = {
  services: Record<string, DetailService>;
};

const detailDocumentSchema = v.object({
  services: v.record(v.string(), v.record(v.string(), v.unknown())),
});

export function parseDetailContent(content: string): DetailDoc {
  let parsed: unknown;
  try {
    parsed = parse(content);
  } catch (e) {
    throw new ValidationError(
      `Invalid compose file: ${e instanceof Error ? e.message : "unknown error"}`
    );
  }
  const result = v.safeParse(detailDocumentSchema, parsed);
  if (!result.success) {
    throw new ValidationError(
      "Invalid compose file: missing 'services' section"
    );
  }
  return result.output;
}

export type ParsedDetailFile = {
  raw: string;
  doc: DetailDoc;
};

export function readDetailFile(filePath: string): ParsedDetailFile {
  const raw = readFileSync(filePath, "utf-8");
  return { raw, doc: parseDetailContent(raw) };
}

function stringField(
  svc: DetailService,
  key: string
): string | undefined {
  const value = svc[key];
  return typeof value === "string" ? value : undefined;
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

export function extractServices(doc: DetailDoc): ServiceInfo[] {
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

export function extractAllEnvVarNames(doc: DetailDoc): string[] {
  const allNames = new Set<string>();
  for (const svc of Object.values(doc.services)) {
    for (const name of extractEnvVarNames(svc.environment)) {
      allNames.add(name);
    }
  }
  return [...allNames];
}
