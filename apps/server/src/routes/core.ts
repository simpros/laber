import { Elysia } from "elysia";
import * as v from "valibot";
import { db, coreConfig } from "@laber/db";
import { sql } from "drizzle-orm";
import {
  deployCoreStack,
  stopCoreStack,
  restartCoreStack,
  getCoreStatus,
  loadCoreConfig,
} from "../lib/core-stack";
import { CORE_KEYS, type CoreKey } from "../lib/core-keys";
import { runLoggedAction, ensureActionSuccess } from "../lib/logged-action";

const saveCoreConfigSchema = v.record(
  v.picklist(CORE_KEYS.map((k) => k.key) as [CoreKey, ...CoreKey[]]),
  v.optional(v.nullable(v.string()))
);

export const coreRoutes = new Elysia()
  .get("/api/core", async () => {
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
  })
  .put(
    "/api/core/config",
    async ({ body }) => {
      // null / undefined = leave unchanged; "" = clear; string = set.
      const rows = CORE_KEYS.flatMap((keyDef) => {
        const value = body[keyDef.key];
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

      return { success: true, message: "Configuration saved" };
    },
    { body: saveCoreConfigSchema }
  )
  .post("/api/core/deploy", async () => {
    const coreConf = await loadCoreConfig();

    const result = await runLoggedAction({
      title: "Deploying core services",
      action: "deploy",
      isCore: true,
      run: (onOutput) => deployCoreStack(coreConf, onOutput),
    });

    return ensureActionSuccess(result, "Deploying core services failed");
  })
  .post("/api/core/stop", async () => {
    const result = await runLoggedAction({
      title: "Stopping core services",
      action: "stop",
      isCore: true,
      run: (onOutput) => stopCoreStack(onOutput),
    });

    return ensureActionSuccess(result, "Stopping core services failed");
  })
  .post("/api/core/restart", async () => {
    const result = await runLoggedAction({
      title: "Restarting core services",
      action: "restart",
      isCore: true,
      run: (onOutput) => restartCoreStack(onOutput),
    });

    return ensureActionSuccess(result, "Restarting core services failed");
  });
