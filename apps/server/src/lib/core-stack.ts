import { sql } from "drizzle-orm";
import { ValidationError } from "./errors";
import { db, coreConfig } from "@laber/db";
import { listContainersSoft } from "./docker-engine";
import { runLoggedDeploy } from "./deploy";
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

export function isCoreConfiguredRows(
  rows: Array<{ key: string; value: string }>
): boolean {
  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  return CORE_KEYS.filter((k) => k.required).every(
    (k) => (byKey.get(k.key) ?? "") !== ""
  );
}

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
  const content = getCoreComposeContent(config);

  const envVars: Record<string, string> = {
    CF_DNS_API_TOKEN: config.cfDnsApiToken,
  };
  if (config.tunnelToken) {
    envVars.TUNNEL_TOKEN = config.tunnelToken;
  }

  return runLoggedDeploy({
    title: "Deploying core services",
    action: "deploy",
    identity: { kind: "core" },
    failureMessage: "Deploying core services failed",
    deploy: {
      composePath,
      composeBytes: content,
      commitLive: true,
      envVars,
      projectName: CORE_PROJECT,
    },
  });
}
