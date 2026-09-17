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
import { CORE_KEYS } from "../lib/core-keys";
import { runLoggedAction } from "../lib/logged-action";
import { parseBody } from "../lib/validate";

const saveCoreConfigSchema = v.record(
  v.picklist(CORE_KEYS.map((k) => k.key) as [string, ...string[]]),
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
  .put("/api/core/config", async ({ body }) => {
    const values = parseBody(saveCoreConfigSchema, body) as Record<
      string,
      string | null | undefined
    >;
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

    return { success: true, message: "Configuration saved" };
  })
  .post("/api/core/deploy", async () => {
    const coreConf = await loadCoreConfig();

    const result = await runLoggedAction({
      title: "Deploying core services",
      action: "deploy",
      isCore: true,
      run: (onOutput) => deployCoreStack(coreConf, onOutput),
    });

    return { success: result.success, output: result.output };
  })
  .post("/api/core/stop", async () => {
    const result = await runLoggedAction({
      title: "Stopping core services",
      action: "stop",
      isCore: true,
      run: (onOutput) => stopCoreStack(onOutput),
    });

    return { success: result.success, output: result.output };
  })
  .post("/api/core/restart", async () => {
    const result = await runLoggedAction({
      title: "Restarting core services",
      action: "restart",
      isCore: true,
      run: (onOutput) => restartCoreStack(onOutput),
    });

    return { success: result.success, output: result.output };
  });
