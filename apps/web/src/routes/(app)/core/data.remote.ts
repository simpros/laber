import { error } from "@sveltejs/kit";
import { query, command } from "$app/server";
import { db, coreConfig, deploymentLogs } from "@laber/db";
import { eq } from "drizzle-orm";
import {
  deployCoreStack,
  stopCoreStack,
  restartCoreStack,
  getCoreStatus,
  type CoreConfig,
} from "$lib/server/core-stack";
import { CORE_KEYS } from "$lib/core-keys";

export const getCoreData = query(async () => {
  const config = await db.select().from(coreConfig);
  const configMap: Record<string, { value: string; isSecret: boolean }> = {};
  for (const c of config) {
    configMap[c.key] = {
      value: c.isSecret ? "" : c.value,
      isSecret: c.isSecret,
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
  "unchecked",
  async (values: Record<string, string>) => {
    for (const keyDef of CORE_KEYS) {
      const value = values[keyDef.key];
      if (value === undefined || value === null) continue;
      if (keyDef.secret && value === "") continue;

      const existing = await db
        .select()
        .from(coreConfig)
        .where(eq(coreConfig.key, keyDef.key));

      if (existing.length > 0) {
        await db
          .update(coreConfig)
          .set({ value, isSecret: keyDef.secret, updatedAt: new Date() })
          .where(eq(coreConfig.key, keyDef.key));
      } else {
        await db.insert(coreConfig).values({
          key: keyDef.key,
          value,
          isSecret: keyDef.secret,
        });
      }
    }

    getCoreData().refresh();
    return { success: true, message: "Configuration saved" };
  },
);

export const deployCore = command(async () => {
  const config = await db.select().from(coreConfig);
  const configMap: Record<string, string> = {};
  for (const c of config) configMap[c.key] = c.value;

  if (
    !configMap.ROOT_DOMAIN ||
    !configMap.CF_DNS_API_TOKEN ||
    !configMap.TUNNEL_TOKEN
  ) {
    error(400, "ROOT_DOMAIN, CF_DNS_API_TOKEN, and TUNNEL_TOKEN are required");
  }

  const coreConf: CoreConfig = {
    rootDomain: configMap.ROOT_DOMAIN,
    cfDnsApiToken: configMap.CF_DNS_API_TOKEN,
    zoneId: configMap.ZONE_ID ?? "",
    tunnelToken: configMap.TUNNEL_TOKEN,
    httpTimeout: configMap.HTTP_TIMEOUT,
    pollingInterval: configMap.POLLING_INTERVAL,
    propagationTimeout: configMap.PROPAGATION_TIMEOUT,
    ttl: configMap.TTL,
    logLevel: configMap.LOG_LEVEL,
    acmeEmail: configMap.ACME_EMAIL,
  };

  const result = await deployCoreStack(coreConf);

  await db.insert(deploymentLogs).values({
    isCore: true,
    action: "deploy",
    status: result.success ? "success" : "error",
    output: result.output,
  });

  getCoreData().refresh();
  return { success: result.success, output: result.output };
});

export const stopCore = command(async () => {
  const result = await stopCoreStack();

  await db.insert(deploymentLogs).values({
    isCore: true,
    action: "stop",
    status: result.success ? "success" : "error",
    output: result.output,
  });

  getCoreData().refresh();
  return { success: result.success, output: result.output };
});

export const restartCore = command(async () => {
  const result = await restartCoreStack();

  await db.insert(deploymentLogs).values({
    isCore: true,
    action: "restart",
    status: result.success ? "success" : "error",
    output: result.output,
  });

  getCoreData().refresh();
  return { success: result.success, output: result.output };
});
