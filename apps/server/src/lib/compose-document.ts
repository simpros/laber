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

// Consumed-slice schemas: each extractor parses only what it reads, once,
// and threads the inferred type — no parallel hand-parser that can drift
// from the gate above.
const portLongSchema = v.object({
  target: v.union([v.string(), v.number()]),
  published: v.optional(v.union([v.string(), v.number()])),
});
const portEntrySchema = v.union([
  v.string(),
  v.number(),
  portLongSchema,
]);
const portsSchema = v.array(portEntrySchema);

const envSchema = v.union([
  v.array(v.unknown()),
  v.record(v.string(), v.unknown()),
]);

const labelsSchema = v.union([
  v.array(v.unknown()),
  v.record(v.string(), v.unknown()),
]);

const serviceSecretsSchema = v.array(v.unknown());

const networkEntrySchema = v.object({
  external: v.optional(v.unknown()),
  name: v.optional(v.unknown()),
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

  const parsed = v.safeParse(envSchema, env);
  if (!parsed.success) return [];

  let values: unknown[];
  if (Array.isArray(parsed.output)) {
    values = parsed.output;
  } else {
    values = Object.values(parsed.output);
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
  const parsed = v.safeParse(v.string(), svc[key]);
  return parsed.success ? parsed.output : undefined;
}

function parsePorts(
  ports: unknown
): Array<{ host?: number; container: number }> {
  const parsed = v.safeParse(portsSchema, ports);
  if (!parsed.success) return [];
  const out: Array<{ host?: number; container: number }> = [];
  for (const entry of parsed.output) {
    // Long-form `ports:` objects ({ target, published }) have no short
    // string to split: read the fields directly instead of String(entry).
    if (typeof entry === "object" && entry !== null) {
      const target = Number(entry.target);
      if (!Number.isFinite(target)) continue;
      const published =
        entry.published === undefined ? NaN : Number(entry.published);
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
  const parsed = v.safeParse(labelsSchema, labels);
  if (!parsed.success) return {};
  if (Array.isArray(parsed.output)) {
    const result: Record<string, string> = {};
    for (const l of parsed.output) {
      const item = v.safeParse(v.string(), l);
      if (!item.success) continue;
      const idx = item.output.indexOf("=");
      if (idx !== -1) {
        result[item.output.slice(0, idx)] = item.output.slice(idx + 1);
      }
    }
    return result;
  }
  {
    const result: Record<string, string> = {};
    for (const [k, value] of Object.entries(parsed.output)) {
      const item = v.safeParse(v.string(), value);
      if (item.success) result[k] = item.output;
    }
    return result;
  }
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

  // `default` wins over other external networks: check it first, then the
  // rest in document order. (A single loop over all values cannot prefer
  // `default` — whichever external net comes first would win.)
  const { default: defaultNet, ...rest } = doc.networks;
  const ordered = [
    ...(defaultNet ? [defaultNet] : []),
    ...Object.values(rest),
  ];
  for (const net of ordered) {
    const parsed = v.safeParse(networkEntrySchema, net);
    if (!parsed.success) continue;
    if (
      parsed.output.external === true &&
      typeof parsed.output.name === "string" &&
      parsed.output.name !== ""
    ) {
      return parsed.output.name;
    }
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
  // Build the service → secret-name map first, before any early return: a
  // compose with service `secrets:` refs but no top-level `secrets:` must
  // fail loud (secret-less deploy), not return [].
  const serviceMap = new Map<string, string[]>();
  for (const [svcName, svc] of Object.entries(doc.services ?? {})) {
    const refs = svc.secrets;
    if (refs === undefined) continue;
    // Only short-syntax names are supported: a long-form object (or any
    // non-list) has no resolvable file, and silently skipping it would deploy
    // without files the compose file intended. Fail loud instead — validated
    // once here through the slice schema, then threaded as typed strings.
    const list = v.safeParse(serviceSecretsSchema, refs);
    if (!list.success) {
      throw new ValidationError(
        `Invalid compose file: service "${svcName}" has a non-list "secrets" section (only short-syntax secret names are supported)`
      );
    }
    for (const ref of list.output) {
      const name = v.safeParse(v.string(), ref);
      if (!name.success) {
        throw new ValidationError(
          `Invalid compose file: service "${svcName}" uses long-form secret syntax (only short-syntax secret names are supported)`
        );
      }
      const acc = serviceMap.get(name.output) ?? [];
      acc.push(svcName);
      serviceMap.set(name.output, acc);
    }
  }

  if (!doc.secrets) {
    if (serviceMap.size > 0) {
      const [ref, svcNames] = [...serviceMap.entries()][0];
      throw new ValidationError(
        `Invalid compose file: service "${svcNames.join(", ")}" refers to undefined secret "${ref}"`
      );
    }
    return [];
  }

  for (const [ref, svcNames] of serviceMap) {
    if (!(ref in doc.secrets)) {
      throw new ValidationError(
        `Invalid compose file: service "${svcNames.join(", ")}" refers to undefined secret "${ref}"`
      );
    }
  }

  const out: SecretDefinition[] = [];
  for (const [name, def] of Object.entries(doc.secrets)) {
    const referenced = (serviceMap.get(name)?.length ?? 0) > 0;
    // Explicit `external: true` secrets are managed outside compose: they
    // are intentionally omitted from file writes (no `secretFiles`), whether
    // or not a service references them.
    if (v.safeParse(v.literal(true), def.external).success) continue;
    const file = v.safeParse(v.string(), def.file);
    if (!file.success || file.output === "") {
      // A referenced secret without a resolvable file would deploy without
      // files the compose file intended — fail loud. Unreferenced file-less
      // entries are inert declarations, so they are skipped.
      if (referenced) {
        throw new ValidationError(
          `Invalid compose file: secret "${name}" has no "file" (only file-based secrets or explicit "external: true" are supported)`
        );
      }
      continue;
    }
    out.push({
      name,
      filePath: isAbsolute(file.output)
        ? file.output
        : resolve(dirname(composePath), file.output),
      services: serviceMap.get(name) ?? [],
    });
  }
  return out;
}

/**
 * The one compose readability gate: envelope parse plus secret-ref
 * validation. Save, detail, and deploy all pass through it, so a file save
 * accepts exactly means deploy/detail accept — never a weaker save gate
 * that stores a file deploy later 400s on.
 */
export function assertComposeReadable(
  content: string,
  composePathHint: string
): ComposeDocument {
  const doc = parseComposeDocument(content);
  extractSecrets(doc, composePathHint);
  return doc;
}

/**
 * Read + fully validate the on-disk compose file: one disk read, envelope
 * parse, and secret-ref validation. Detail and deploy share it so both see
 * the same "valid compose" contract (missing file is the caller's branch —
 * this throws the raw read error for a missing file).
 */
export function loadComposeDocument(composePath: string): {
  raw: string;
  doc: ComposeDocument;
  secrets: SecretDefinition[];
} {
  const { raw, doc } = readComposeFile(composePath);
  const secrets = extractSecrets(doc, composePath);
  return { raw, doc, secrets };
}
