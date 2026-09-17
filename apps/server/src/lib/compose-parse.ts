import { readFileSync } from "fs";
import { isAbsolute, resolve, dirname } from "path";
import * as v from "valibot";
import { parse } from "yaml";
import { ValidationError } from "./errors";

/**
 * Compose parse gate: the one schema + `parse`/`load` every path shares
 * (detail, deploy, save). A single envelope whose service entries are fully
 * schemed for the slices we consume (image, ports, environment, labels,
 * secrets refs) plus the network/secret envelopes deploy reads.
 *
 * Fail policy, aligned at this gate: wrong *shapes* (a non-list `ports:`,
 * a non-map `secrets:`, a string service entry) fail loud for every
 * consumer — save, detail, and deploy share the rejection. Skipped
 * *values* inside a valid shape (a non-string env entry, a non-string
 * label value) stay lenient in the service readers (`compose-services.ts`):
 * they are inert data, not a broken document.
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

/**
 * Secret extraction — module-private. Production flows go
 * `parse`/`load` → this runs once inside the gate, and the gate returns
 * what it computed. There is no second public entry that skips Valibot.
 */
function extractSecrets(
  doc: ComposeDocument,
  composePath: string
): SecretDefinition[] {
  // Build the service → secret-name map first, before any early return: a
  // compose with service `secrets:` refs but no top-level `secrets:` must
  // fail loud (secret-less deploy), not return [].
  // Service `secrets:` refs are short-syntax names (enforced by the schema
  // above): each one must resolve to a top-level entry.
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
    // Explicit `external: true` secrets are managed outside compose: they
    // are intentionally omitted from file writes (no `secretFiles`), whether
    // or not a service references them.
    if (def.external === true) continue;
    const file = def.file;
    if (typeof file !== "string" || file === "") {
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
    // The envelope parsed but a consumed slice has the wrong shape: name
    // the offending paths instead of blaming a missing `services` section
    // (which is present — the gate now rejects more than that).
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
  // Secret-ref validation is part of the parse gate (not a second pass the
  // caller must remember): save/detail/deploy all reject dangling refs,
  // long-form refs, and file-less referenced secrets alike. The gate returns
  // what it computed — one extract, no discard-and-reextract downstream.
  const secrets = extractSecrets(result.output, composePathHint);
  return { doc: result.output, secrets };
}

/**
 * Read + fully validate the on-disk compose file: one disk read, envelope
 * parse, and secret-ref validation. Detail and deploy share it so both see
 * the same "valid compose" contract (missing file is the caller's branch —
 * this throws the raw read error for a missing file).
 *
 * The two compose entry points are `parseComposeDocument` (content) and
 * this `loadComposeDocument` (path) — both run the full gate, so save (via
 * parse) accepts exactly what deploy/detail (via load) accept.
 */
export function loadComposeDocument(composePath: string): {
  raw: string;
  doc: ComposeDocument;
  secrets: SecretDefinition[];
} {
  const raw = readFileSync(composePath, "utf-8");
  const { doc, secrets } = parseComposeDocument(raw, composePath);
  return { raw, doc, secrets };
}
