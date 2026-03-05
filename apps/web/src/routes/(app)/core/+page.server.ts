import { fail } from "@sveltejs/kit";
import { db } from "$lib/server/db";
import { coreConfig, deploymentLogs } from "@laber/db";
import { eq } from "drizzle-orm";
import {
  deployCoreStack,
  stopCoreStack,
  restartCoreStack,
  getCoreStatus,
  type CoreConfig,
} from "$lib/server/core-stack";
import type { PageServerLoad, Actions } from "./$types";

const CORE_KEYS = [
  { key: "ROOT_DOMAIN", label: "Root Domain", secret: false, placeholder: "yourdomain.com" },
  { key: "CF_DNS_API_TOKEN", label: "Cloudflare DNS API Token", secret: true, placeholder: "Your CF API token" },
  { key: "ZONE_ID", label: "Cloudflare Zone ID", secret: true, placeholder: "Your CF Zone ID" },
  { key: "TUNNEL_TOKEN", label: "Cloudflare Tunnel Token", secret: true, placeholder: "Your tunnel token" },
  { key: "ACME_EMAIL", label: "ACME Email", secret: false, placeholder: "admin@yourdomain.com" },
  { key: "HTTP_TIMEOUT", label: "HTTP Timeout", secret: false, placeholder: "60" },
  { key: "POLLING_INTERVAL", label: "Polling Interval", secret: false, placeholder: "10" },
  { key: "PROPAGATION_TIMEOUT", label: "Propagation Timeout", secret: false, placeholder: "3600" },
  { key: "TTL", label: "TTL", secret: false, placeholder: "300" },
  { key: "LOG_LEVEL", label: "Log Level", secret: false, placeholder: "INFO" },
] as const;

export const load: PageServerLoad = async () => {
  const config = await db.select().from(coreConfig);
  const configMap: Record<string, { value: string; isSecret: boolean }> = {};
  for (const c of config) {
    configMap[c.key] = { value: c.isSecret ? "" : c.value, isSecret: c.isSecret };
  }

  let coreServices: Awaited<ReturnType<typeof getCoreStatus>> = [];
  try {
    coreServices = await getCoreStatus();
  } catch {
    // Docker not available
  }

  return {
    config: configMap,
    coreKeys: CORE_KEYS,
    coreServices,
    isConfigured: config.some((c) => c.key === "ROOT_DOMAIN"),
  };
};

export const actions: Actions = {
  save: async ({ request }) => {
    const formData = await request.formData();

    for (const keyDef of CORE_KEYS) {
      const value = formData.get(keyDef.key) as string;
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

    return { success: true, message: "Configuration saved" };
  },

  deploy: async () => {
    const config = await db.select().from(coreConfig);
    const configMap: Record<string, string> = {};
    for (const c of config) configMap[c.key] = c.value;

    if (!configMap.ROOT_DOMAIN || !configMap.CF_DNS_API_TOKEN || !configMap.TUNNEL_TOKEN) {
      return fail(400, {
        error: "ROOT_DOMAIN, CF_DNS_API_TOKEN, and TUNNEL_TOKEN are required",
      });
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

    return { success: result.success, output: result.output };
  },

  stop: async () => {
    const result = await stopCoreStack();

    await db.insert(deploymentLogs).values({
      isCore: true,
      action: "stop",
      status: result.success ? "success" : "error",
      output: result.output,
    });

    return { success: result.success, output: result.output };
  },

  restart: async () => {
    const result = await restartCoreStack();

    await db.insert(deploymentLogs).values({
      isCore: true,
      action: "restart",
      status: result.success ? "success" : "error",
      output: result.output,
    });

    return { success: result.success, output: result.output };
  },
};
