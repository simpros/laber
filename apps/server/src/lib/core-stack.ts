import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { sql } from "drizzle-orm";
import { ValidationError } from "./errors";
import { db, coreConfig } from "@laber/db";
import { listContainers } from "./docker";
import { runCoreOp, loggedDeployAction } from "./compose-actions";
import { DATA_DIR, type ConfigValue } from "./config";
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

function getComposeDir(): string {
  const dir = join(DATA_DIR, "core");
  mkdirSync(dir, { recursive: true });
  return dir;
}

function getComposePath(): string {
  return join(getComposeDir(), "docker-compose.yaml");
}

export async function getCoreStatus(): Promise<CoreServiceStatus[]> {
  const containers = await listContainers("laber-core");
  return containers.map((c) => ({
    name: c.name,
    status: c.status,
    state: c.state,
    image: c.image,
  }));
}

/** Docker state that never throws: routes show "unknown" instead of 500. */
export async function safeCoreStatus(): Promise<CoreServiceStatus[]> {
  try {
    return await getCoreStatus();
  } catch {
    return [];
  }
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

export async function getCoreOverview() {
  const [config, coreServices] = await Promise.all([
    db.select().from(coreConfig),
    safeCoreStatus(),
  ]);
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

  return {
    config: configMap,
    coreServices,
    isConfigured: isCoreConfiguredRows(config),
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
  const composePath = getComposePath();
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
      projectName: "laber-core",
    },
  });
}

export async function stopCore() {
  return runCoreOp("stop", getComposePath());
}

export async function restartCore() {
  return runCoreOp("restart", getComposePath());
}
