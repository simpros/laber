import { existsSync, readFileSync } from "fs";
import { isAbsolute, resolve, dirname } from "path";
import * as v from "valibot";
import { parse } from "yaml";
import { ValidationError } from "./errors";

/**
 * The one compose schema + parse/load gate every path shares. Wrong *shapes*
 * fail loud for every consumer; skipped *values* inside a valid shape stay lenient in `compose-services.ts`.
 */
const portLongSchema = v.object({
  target: v.union([v.string(), v.number()]),
  published: v.optional(v.union([v.string(), v.number()])),
});
const portEntrySchema = v.union([v.string(), v.number(), portLongSchema]);

const serviceEnvSchema = v.union([
  v.array(v.unknown()),
  v.record(v.string(), v.unknown()),
]);

const serviceLabelsSchema = v.union([
  v.array(v.unknown()),
  v.record(v.string(), v.unknown()),
]);

const serviceSecretsSchema = v.array(v.string());

const composeServiceSchema = v.object({
  image: v.optional(v.string()),
  container_name: v.optional(v.string()),
  ports: v.optional(v.array(portEntrySchema)),
  environment: v.optional(serviceEnvSchema),
  labels: v.optional(serviceLabelsSchema),
  secrets: v.optional(serviceSecretsSchema),
});

const networkEntrySchema = v.object({
  external: v.optional(
    v.union([v.boolean(), v.record(v.string(), v.unknown())])
  ),
  name: v.optional(v.string()),
});

const secretEntrySchema = v.object({
  file: v.optional(v.string()),
  external: v.optional(v.unknown()),
});

const composeDocumentSchema = v.object({
  services: v.record(v.string(), composeServiceSchema),
  networks: v.optional(v.record(v.string(), networkEntrySchema)),
  secrets: v.optional(v.record(v.string(), secretEntrySchema)),
});

export type ComposeService = v.InferOutput<typeof composeServiceSchema>;

export type ComposeDocument = v.InferOutput<typeof composeDocumentSchema>;

export type SecretDefinition = {
  name: string;
  filePath: string;
  services: string[];
};

/** Module-private: production flows go through the gate, never around Valibot. */
function extractSecrets(
  doc: ComposeDocument,
  composePath: string
): SecretDefinition[] {
  // Service refs without a top-level entry must fail loud, not return [].
  // Short-syntax names only (enforced by the schema above).
  const serviceMap = new Map<string, string[]>();
  for (const [svcName, svc] of Object.entries(doc.services)) {
    const refs = svc.secrets;
    if (refs === undefined) continue;
    for (const ref of refs) {
      const acc = serviceMap.get(ref) ?? [];
      acc.push(svcName);
      serviceMap.set(ref, acc);
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
    // Explicit `external: true` secrets are managed outside compose: never written to files.
    if (def.external === true) continue;
    const file = def.file;
    if (typeof file !== "string" || file === "") {
      // Referenced without a file would deploy secret-less: fail loud. Unreferenced file-less entries are skipped as inert.
      if (referenced) {
        throw new ValidationError(
          `Invalid compose file: secret "${name}" has no "file" (only file-based secrets or explicit "external: true" are supported)`
        );
      }
      continue;
    }
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

export function parseComposeDocument(
  content: string,
  composePathHint = "."
): { doc: ComposeDocument; secrets: SecretDefinition[] } {
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
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("services" in parsed)
    ) {
      throw new ValidationError(
        "Invalid compose file: missing 'services' section"
      );
    }
    // Name the offending paths instead of blaming a missing `services` section (which is present).
    const detail = result.issues
      .map((issue) => {
        const path = (issue.path ?? [])
          .map((segment) => {
            const key = (segment as { key?: unknown }).key;
            return typeof key === "string" || typeof key === "number"
              ? String(key)
              : "";
          })
          .filter((part) => part !== "")
          .join(".");
        const message = issue.message ?? "invalid value";
        return path ? `${path}: ${message}` : message;
      })
      .join("; ");
    throw new ValidationError(`Invalid compose file: ${detail}`);
  }
  const secrets = extractSecrets(result.output, composePathHint);
  return { doc: result.output, secrets };
}

/** Read + validate the on-disk compose file through the one gate, so detail and deploy share the same contract. */
export function loadComposeDocument(composePath: string): {
  raw: string;
  doc: ComposeDocument;
  secrets: SecretDefinition[];
} {
  const raw = readFileSync(composePath, "utf-8");
  const { doc, secrets } = parseComposeDocument(raw, composePath);
  return { raw, doc, secrets };
}

/**
 * The one on-disk load policy: detail passes `{ missing: "empty" }`
 * (nothing on disk is valid empty UI state); deploy passes `{ missing:
 * "error" }` (nothing on disk is a loud `ValidationError`). New gate rules land here, not at call sites.
 */
export function loadCompose(
  composePath: string,
  opts: { missing: "error"; errorPrefix?: string }
): { raw: string; doc: ComposeDocument; secrets: SecretDefinition[] };
export function loadCompose(
  composePath: string,
  opts: { missing: "empty" }
): { raw: string; doc: ComposeDocument | null; secrets: SecretDefinition[] };
export function loadCompose(
  composePath: string,
  opts: { missing: "empty" | "error"; errorPrefix?: string }
): { raw: string; doc: ComposeDocument | null; secrets: SecretDefinition[] } {
  if (!existsSync(composePath)) {
    if (opts.missing === "empty") return { raw: "", doc: null, secrets: [] };
    throw new ValidationError(
      opts.errorPrefix
        ? `${opts.errorPrefix}: compose file is missing`
        : `Compose file is missing: ${composePath}`
    );
  }
  try {
    const { raw, doc, secrets } = loadComposeDocument(composePath);
    return { raw, doc, secrets };
  } catch (e) {
    if (e instanceof ValidationError && opts.errorPrefix) {
      throw new ValidationError(
        `${opts.errorPrefix}: failed to parse compose file (${e.message})`
      );
    }
    throw e;
  }
}
