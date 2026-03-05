import { readFileSync } from "fs";
import { parse } from "yaml";

export type ComposeFile = {
  services: Record<string, ComposeService>;
  networks?: Record<string, ComposeNetwork>;
  volumes?: Record<string, unknown>;
  secrets?: Record<string, unknown>;
};

export type ComposeService = {
  image?: string;
  container_name?: string;
  environment?: string[] | Record<string, string>;
  labels?: string[] | Record<string, string>;
  ports?: string[];
  volumes?: string[];
  restart?: string;
  networks?: string[] | Record<string, unknown>;
  [key: string]: unknown;
};

export type ComposeNetwork = {
  name?: string;
  external?: boolean;
};

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

export function parseComposeFile(filePath: string): ComposeFile {
  const content = readFileSync(filePath, "utf-8");
  return parse(content) as ComposeFile;
}

function extractEnvVarNames(
  env: string[] | Record<string, string> | undefined,
): string[] {
  if (!env) return [];
  const varPattern = /\$\{?([A-Z_][A-Z0-9_]*)}?/g;
  const names = new Set<string>();

  const values: string[] = Array.isArray(env)
    ? env
    : Object.values(env);

  for (const val of values) {
    let match: RegExpExecArray | null;
    while ((match = varPattern.exec(val)) !== null) {
      names.add(match[1]);
    }
  }

  return [...names];
}

function parsePorts(
  ports: string[] | undefined,
): Array<{ host?: number; container: number }> {
  if (!ports) return [];
  return ports.map((p) => {
    const parts = p.toString().split(":");
    if (parts.length >= 2) {
      return {
        host: parseInt(parts[0], 10) || undefined,
        container: parseInt(
          parts[1].split("/")[0],
          10,
        ),
      };
    }
    return {
      container: parseInt(parts[0].split("/")[0], 10),
    };
  });
}

function normalizeLabels(
  labels: string[] | Record<string, string> | undefined,
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
  labels: Record<string, string>,
): ServiceInfo["traefikRoute"] | undefined {
  const ruleKey = Object.keys(labels).find(
    (k) =>
      k.match(/^traefik\.http\.routers\..+\.rule$/) !== null,
  );
  if (!ruleKey) return undefined;

  const routerName = ruleKey.split(".")[3];
  const rule = labels[ruleKey];

  const hostMatch = rule.match(
    /Host\(`([^`]+)`\)/,
  );
  const subdomain = hostMatch?.[1]?.split(".")[0] ?? "";

  const portKey = Object.keys(labels).find(
    (k) =>
      k.match(
        /^traefik\.http\.services\..+\.loadbalancer\.server\.port$/,
      ) !== null,
  );
  const port = portKey ? parseInt(labels[portKey], 10) : 0;

  return { subdomain, port, routerName };
}

export function extractServices(
  compose: ComposeFile,
): ServiceInfo[] {
  return Object.entries(compose.services).map(
    ([name, svc]) => {
      const labels = normalizeLabels(svc.labels);
      return {
        name,
        image: svc.image ?? "",
        containerName: svc.container_name,
        ports: parsePorts(svc.ports),
        envVars: extractEnvVarNames(svc.environment),
        traefikRoute: extractTraefikFromLabels(labels),
      };
    },
  );
}

export function extractNetworkName(
  compose: ComposeFile,
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

export function extractTraefikRoutes(
  compose: ComposeFile,
): Array<{
  service: string;
  subdomain: string;
  port: number;
  routerName: string;
}> {
  const routes: Array<{
    service: string;
    subdomain: string;
    port: number;
    routerName: string;
  }> = [];

  for (const [name, svc] of Object.entries(
    compose.services,
  )) {
    const labels = normalizeLabels(svc.labels);
    const route = extractTraefikFromLabels(labels);
    if (route) {
      routes.push({ service: name, ...route });
    }
  }

  return routes;
}
