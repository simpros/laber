import { readFileSync } from "fs";
import { dirname, isAbsolute, resolve } from "path";
import * as v from "valibot";
import { parse } from "yaml";
import { ValidationError } from "./errors";

/**
 * Deploy-side compose view: the external network name and file-based secret
 * definitions. Validates only the envelope it reads (services mapping plus
 * optional networks/secrets mappings of unknown records) — each extractor
 * narrows its own slice locally, so there is no central `as ComposeFile`
 * cast. The detail view (`compose-detail.ts`) owns everything else.
 */
export type DeployDoc = {
  services: Record<string, Record<string, unknown>>;
  networks?: Record<string, Record<string, unknown>>;
  secrets?: Record<string, Record<string, unknown>>;
};

const unknownRecord = v.record(v.string(), v.unknown());

const deployDocumentSchema = v.object({
  services: v.record(v.string(), unknownRecord),
  networks: v.optional(v.record(v.string(), unknownRecord)),
  secrets: v.optional(v.record(v.string(), unknownRecord)),
});

export function parseDeployContent(content: string): DeployDoc {
  let parsed: unknown;
  try {
    parsed = parse(content);
  } catch (e) {
    throw new ValidationError(
      `Invalid compose file: ${e instanceof Error ? e.message : "unknown error"}`
    );
  }
  const result = v.safeParse(deployDocumentSchema, parsed);
  if (!result.success) {
    throw new ValidationError(
      "Invalid compose file: missing 'services' section"
    );
  }
  return result.output;
}

export function readDeployFile(filePath: string): DeployDoc {
  return parseDeployContent(readFileSync(filePath, "utf-8"));
}

export function extractNetworkName(doc: {
  services?: Record<string, Record<string, unknown>>;
  networks?: Record<string, Record<string, unknown>>;
}): string | undefined {
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
  doc: {
    services?: Record<string, Record<string, unknown>>;
    secrets?: Record<string, Record<string, unknown>>;
  },
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
