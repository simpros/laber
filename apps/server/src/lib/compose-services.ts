import type { ComposeDocument, ComposeService } from "./compose-parse";

/**
 * Compose service read-model: pure projections off the parsed document for
 * the detail UI (services, env names, networks). Fail policy lives at the
 * parse gate (`compose-parse.ts`); skipped *values* inside a valid shape
 * (a non-string env entry, a non-string label value) stay lenient here —
 * they are inert data, not a broken document.
 */

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

export function extractEnvVarNames(
  env: ComposeService["environment"]
): string[] {
  if (env === undefined) return [];
  const varPattern = /\$\{?([A-Z_][A-Z0-9_]*)}?/g;
  const names = new Set<string>();

  const values: unknown[] = Array.isArray(env) ? env : Object.values(env);

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
  ports: ComposeService["ports"]
): Array<{ host?: number; container: number }> {
  if (!ports) return [];
  const out: Array<{ host?: number; container: number }> = [];
  for (const entry of ports) {
    // Long-form `ports:` objects ({ target, published }) have no short
    // string to split: read the fields directly instead of String(entry).
    if (typeof entry === "object") {
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

function normalizeLabels(
  labels: ComposeService["labels"]
): Record<string, string> {
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
  {
    const result: Record<string, string> = {};
    for (const [k, value] of Object.entries(labels)) {
      if (typeof value === "string") result[k] = value;
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
      image: svc.image ?? "",
      containerName: svc.container_name,
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
    if (
      net.external === true &&
      typeof net.name === "string" &&
      net.name !== ""
    ) {
      return net.name;
    }
  }

  return undefined;
}
