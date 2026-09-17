import { writeFileSync } from "fs";
import { sql } from "drizzle-orm";
import { ValidationError } from "./errors";
import { db, coreConfig } from "@laber/db";
import { listContainers, listContainersSoft } from "./docker-engine";
import { loggedDeployAction } from "./compose-actions";
import { type ConfigValue } from "./config";
import { CORE_PROJECT, getCoreComposePath } from "./core-identity";
import { getCoreComposeContent } from "./core-compose";
import {
  CORE_KEYS,
  type CoreKey,
  type CoreConfigShape,
} from "./core-keys";

export type CoreConfig = CoreConfigShape;

type CoreServiceStatus = {
  name: string;
  status: string;
  state: string;
  image: string;
};

export async function loadCoreConfig(): Promise<CoreConfig> {
  const rows = await db.select().from(coreConfig);
  const configMap = new Map(rows.map((r) => [r.key, r.value]));

  const missing = CORE_KEYS.filter(
    (k) => k.required && !configMap.get(k.key)
  ).map((k) => k.key);
  if (missing.length > 0) {
    throw new ValidationError(
      `${missing.join(" and ")} ${missing.length > 1 ? "are" : "is"} required`
    );
  }

  // Required props come straight from the `CORE_KEYS` catalog: the missing
  // check above guarantees every required key is present, and `required`
  // re-reads through the same map so the return type is `CoreConfig` with
  // no assertion and no parallel key literals. Optionals land only when
  // present (empty string counts as unset).
  const required = (key: CoreKey): string => {
    const value = configMap.get(key);
    if (!value) throw new ValidationError(`${key} is required`);
    return value;
  };
  const config: CoreConfig = {
    rootDomain: required("ROOT_DOMAIN"),
    cfDnsApiToken: required("CF_DNS_API_TOKEN"),
  };
  for (const field of CORE_KEYS) {
    if (field.required) continue;
    const value = configMap.get(field.key);
    if (value !== undefined && value !== "") {
      config[field.prop] = value;
    }
  }

  return config;
}

/** Compose file for the core project. Re-exported here; owned by `core-identity`. */
export { getCoreComposePath };

export async function getCoreStatus(): Promise<CoreServiceStatus[]> {
  const containers = await listContainers(CORE_PROJECT);
  return containers.map(toCoreServiceStatus);
}

/** Docker state that never throws: routes show "unknown" instead of 500. */
export async function safeCoreStatus(): Promise<CoreServiceStatus[]> {
  const containers = await listContainersSoft(CORE_PROJECT);
  return containers.map(toCoreServiceStatus);
}

function toCoreServiceStatus(c: {
  name: string;
  status: string;
  state: string;
  image: string;
}): CoreServiceStatus {
  return { name: c.name, status: c.status, state: c.state, image: c.image };
}

/**
 * One definition of "core is configured", shared by overview, dashboard,
 * and deploy gating: every required CORE_KEYS entry has a non-empty stored
 * value. A lone ROOT_DOMAIN must not report configured when deploy would
 * still 400 on the missing token.
 */
export function isCoreConfiguredRows(
  rows: Array<{ key: string; value: string }>
): boolean {
  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  return CORE_KEYS.filter((k) => k.required).every(
    (k) => (byKey.get(k.key) ?? "") !== ""
  );
}

/**
 * The one "core configured + services" assembly, shared by `GET /api/core`
 * and the dashboard. Overview adds the per-key config map; dashboard adds
 * stats — neither re-selects `coreConfig` nor re-derives configured-ness.
 */
export async function getCoreSnapshot() {
  const [rows, services] = await Promise.all([
    db.select().from(coreConfig),
    safeCoreStatus(),
  ]);
  return {
    configured: isCoreConfiguredRows(rows),
    services,
    rows,
  };
}

export async function getCoreOverview() {
  // One assembly of "configured + services", shared with the dashboard:
  // overview only adds the per-key config map on top of the snapshot.
  const snapshot = await getCoreSnapshot();
  const storedByKey = new Map(snapshot.rows.map((c) => [c.key, c]));
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

  return {
    config: configMap,
    coreServices: snapshot.services,
    isConfigured: snapshot.configured,
  };
}

/** `null` (or an omitted key) = leave unchanged; `""` = clear; string = set (patch upsert — see `ConfigValue`). */
export async function saveCoreConfig(
  input: Record<string, ConfigValue | undefined>
) {
  const rows = CORE_KEYS.flatMap((keyDef) => {
    const value = input[keyDef.key];
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
}

export async function deployCore() {
  const config = await loadCoreConfig();
  const composePath = getCoreComposePath();
  writeFileSync(composePath, getCoreComposeContent(config), "utf-8");

  const envVars: Record<string, string> = {
    CF_DNS_API_TOKEN: config.cfDnsApiToken,
  };
  if (config.tunnelToken) {
    envVars.TUNNEL_TOKEN = config.tunnelToken;
  }

  return loggedDeployAction({
    title: "Deploying core services",
    action: "deploy",
    isCore: true,
    failureMessage: "Deploying core services failed",
    deploy: {
      composePath,
      envVars,
      projectName: CORE_PROJECT,
    },
  });
}
