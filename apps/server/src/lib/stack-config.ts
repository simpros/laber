import { dirname } from "path";
import { mkdirSync, writeFileSync } from "fs";
import { db, stackEnvVars, stackSecrets } from "@laber/db";
import { eq } from "drizzle-orm";
import { parseComposeDocument } from "./compose-document";
import { getStackAndRepo, assertStackName, type ConfigValue } from "./config";
import { ValidationError } from "./errors";
import type { StackTx } from "./db-tx";

export async function saveComposeContent(name: string, content: string) {
  assertStackName(name);
  if (!content) {
    throw new ValidationError("Compose content must not be empty");
  }
  // The shared compose gate: syntax errors, a missing `services` section,
  // and malformed `secrets:`/`networks:` envelopes are rejected before
  // anything hits disk — the same document deploy will parse, so save can
  // never accept a file deploy cannot read.
  parseComposeDocument(content);
  const { composePath } = await getStackAndRepo(name);

  mkdirSync(dirname(composePath), { recursive: true });
  writeFileSync(composePath, content, "utf-8");

  return { success: true };
}

/**
 * Shared replace-all for nullable keyed rows (stack env vars, stack secrets):
 * `null` means "leave unchanged" (keep the stored value, default ""),
 * anything else replaces the whole set in one transaction.
 */
export function replaceNullableKeyedRows(
  existingByKey: Map<string, string>,
  entries: Array<{ key: string; value: ConfigValue }>
): Array<{ key: string; value: string }> {
  return entries.map((e) => ({
    key: e.key,
    value: e.value ?? existingByKey.get(e.key) ?? "",
  }));
}

export type EnvEntry = {
  key: string;
  value: ConfigValue;
  isSecret: boolean;
};

export type SecretEntry = {
  name: string;
  value: ConfigValue;
};

/**
 * One replace-all for the nullable keyed-bag tables (stack env vars, stack
 * secrets): `null` means "leave unchanged" (keep the stored value, default
 * ""), anything else replaces the whole set. The snapshot read and the
 * delete+insert share one transaction, so concurrent PUTs merge against
 * committed state instead of clobbering each other's keys. Each table is
 * ~5 lines of column mapping; the load → merge → delete+insert shell lives
 * here exactly once.
 */
async function replaceStackKeyedBag(options: {
  name: string;
  entries: Array<{ key: string; value: ConfigValue }>;
  loadExisting: (tx: StackTx, stackId: string) => Map<string, string>;
  writeAll: (
    tx: StackTx,
    stackId: string,
    merged: Array<{ key: string; value: string }>
  ) => void;
}): Promise<{ success: true }> {
  assertStackName(options.name);
  const { stack } = await getStackAndRepo(options.name);

  db.transaction((tx) => {
    const existingByKey = options.loadExisting(tx, stack.id);
    const merged = replaceNullableKeyedRows(existingByKey, options.entries);
    options.writeAll(tx, stack.id, merged);
  });

  return { success: true };
}

export async function replaceStackEnv(name: string, entries: EnvEntry[]) {
  const isSecretByKey = new Map(entries.map((e) => [e.key, e.isSecret]));
  return replaceStackKeyedBag({
    name,
    entries,
    loadExisting: (tx, stackId) => {
      const existing = tx
        .select()
        .from(stackEnvVars)
        .where(eq(stackEnvVars.stackId, stackId))
        .all();
      return new Map(existing.map((e) => [e.key, e.value]));
    },
    writeAll: (tx, stackId, merged) => {
      tx.delete(stackEnvVars).where(eq(stackEnvVars.stackId, stackId)).run();
      if (merged.length > 0) {
        tx.insert(stackEnvVars)
          .values(
            merged.map((e) => ({
              stackId,
              key: e.key,
              value: e.value,
              isSecret: isSecretByKey.get(e.key) ?? false,
            }))
          )
          .run();
      }
    },
  });
}

export async function replaceStackSecrets(
  name: string,
  entries: SecretEntry[]
) {
  return replaceStackKeyedBag({
    name,
    entries: entries.map((e) => ({ key: e.name, value: e.value })),
    loadExisting: (tx, stackId) => {
      const existing = tx
        .select()
        .from(stackSecrets)
        .where(eq(stackSecrets.stackId, stackId))
        .all();
      return new Map(existing.map((s) => [s.name, s.value]));
    },
    writeAll: (tx, stackId, merged) => {
      tx.delete(stackSecrets).where(eq(stackSecrets.stackId, stackId)).run();
      if (merged.length > 0) {
        tx.insert(stackSecrets)
          .values(
            merged.map((e) => ({
              stackId,
              name: e.key,
              value: e.value,
            }))
          )
          .run();
      }
    },
  });
}
