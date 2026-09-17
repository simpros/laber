import * as v from "valibot";
import { query, command } from "$app/server";
import { db, coreConfig } from "@laber/db";
import { sql } from "drizzle-orm";
import {
  deployCoreStack,
  stopCoreStack,
  restartCoreStack,
  getCoreStatus,
  loadCoreConfig,
} from "$lib/server/core-stack";
import { CORE_KEYS } from "$lib/core-keys";
import { runLoggedAction } from "$lib/server/logged-action";
import { requireUser } from "$lib/server/auth";

const saveCoreConfigSchema = v.record(
  v.picklist(CORE_KEYS.map((k) => k.key) as [string, ...string[]]),
  v.optional(v.nullable(v.string()))
);

export const getCoreData = query(async () => {
  requireUser();
  const config = await db.select().from(coreConfig);
  const storedByKey = new Map(config.map((c) => [c.key, c]));
  const configMap: Record<
    string,
    { value: string; isSecret: boolean; hasValue: boolean }
  > = {};
  for (const keyDef of CORE_KEYS) {
    const stored = storedByKey.get(keyDef.key);
    configMap[keyDef.key] = {
      value: stored && !stored.isSecret ? stored.value : "",
      isSecret: stored?.isSecret ?? keyDef.secret,
      hasValue: (stored?.value ?? "") !== "",
    };
  }

  let coreServices: Awaited<ReturnType<typeof getCoreStatus>> = [];
  try {
    coreServices = await getCoreStatus();
  } catch {
    // Docker not available
  }

  return {
    config: configMap,
    coreServices,
    isConfigured: config.some((c) => c.key === "ROOT_DOMAIN"),
  };
});

export const saveCoreConfig = command(
  saveCoreConfigSchema,
  async (values: Record<string, string | null | undefined>) => {
    requireUser();
    // null / undefined = leave unchanged; "" = clear; string = set.
    const rows = CORE_KEYS.flatMap((keyDef) => {
      const value = values[keyDef.key];
      if (value === undefined || value === null) return [];
      return [{ key: keyDef.key, value, isSecret: keyDef.secret }];
    });

    if (rows.length > 0) {
      await db
        .insert(coreConfig)
        .values(rows)
        .onConflictDoUpdate({
          target: coreConfig.key,
          set: {
            value: sql`excluded.value`,
            isSecret: sql`excluded.is_secret`,
            updatedAt: new Date(),
          },
        });
    }

    getCoreData().refresh();
    return { success: true, message: "Configuration saved" };
  }
);

export const deployCore = command(async () => {
  requireUser();
  const coreConf = await loadCoreConfig();

  const result = await runLoggedAction({
    title: "Deploying core services",
    action: "deploy",
    isCore: true,
    run: (onOutput) => deployCoreStack(coreConf, onOutput),
  });

  getCoreData().refresh();
  return { success: result.success, output: result.output };
});

export const stopCore = command(async () => {
  requireUser();
  const result = await runLoggedAction({
    title: "Stopping core services",
    action: "stop",
    isCore: true,
    run: (onOutput) => stopCoreStack(onOutput),
  });

  getCoreData().refresh();
  return { success: result.success, output: result.output };
});

export const restartCore = command(async () => {
  requireUser();
  const result = await runLoggedAction({
    title: "Restarting core services",
    action: "restart",
    isCore: true,
    run: (onOutput) => restartCoreStack(onOutput),
  });

  getCoreData().refresh();
  return { success: result.success, output: result.output };
});
