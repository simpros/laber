import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { sql } from "drizzle-orm";
import { ValidationError } from "./errors";
import { db, coreConfig } from "@laber/db";
import { listContainers, runComposeCommand } from "./docker";
import { deployStack } from "./stack-manager";
import { runLoggedAction, ensureActionSuccess } from "./logged-action";
import { DATA_DIR } from "./config";
import { getCoreComposeContent } from "./core-compose";
import { CORE_KEYS, type CoreConfigShape } from "./core-keys";

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

  // Required props are assigned directly after the missing check, so the
  // result is a `CoreConfig` with no assertion; optionals land only when
  // present (empty string counts as unset).
  const config: CoreConfig = {
    rootDomain: configMap.get("ROOT_DOMAIN")!,
    cfDnsApiToken: configMap.get("CF_DNS_API_TOKEN")!,
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

export async function deployCoreStack(
  config: CoreConfig,
  onOutput?: (chunk: string) => void
): Promise<{ success: boolean; output: string }> {
  const composePath = getComposePath();
  writeFileSync(composePath, getCoreComposeContent(config), "utf-8");

  const envVars: Record<string, string> = {
    CF_DNS_API_TOKEN: config.cfDnsApiToken,
  };
  if (config.tunnelToken) {
    envVars.TUNNEL_TOKEN = config.tunnelToken;
  }

  return deployStack({
    composePath,
    envVars,
    projectName: "laber-core",
    onOutput,
  });
}

export async function stopCoreStack(
  onOutput?: (chunk: string) => void
): Promise<{
  success: boolean;
  output: string;
}> {
  return runComposeCommand(
    getComposePath(),
    ["down"],
    "laber-core",
    onOutput
  );
}

export async function restartCoreStack(
  onOutput?: (chunk: string) => void
): Promise<{
  success: boolean;
  output: string;
}> {
  return runComposeCommand(
    getComposePath(),
    ["restart"],
    "laber-core",
    onOutput
  );
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

/** null / undefined = leave unchanged; "" = clear; string = set. */
export async function saveCoreConfig(
  input: Record<string, string | null | undefined>
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

export async function runCoreLifecycle(options: {
  title: string;
  action: string;
  run: (onOutput: (chunk: string) => void) => Promise<{
    success: boolean;
    output: string;
  }>;
}) {
  const result = await runLoggedAction({
    title: options.title,
    action: options.action,
    isCore: true,
    run: options.run,
  });

  return ensureActionSuccess(result, `${options.title} failed`);
}

export async function deployCore() {
  const config = await loadCoreConfig();
  return runCoreLifecycle({
    title: "Deploying core services",
    action: "deploy",
    run: (onOutput) => deployCoreStack(config, onOutput),
  });
}

export async function stopCore() {
  return runCoreLifecycle({
    title: "Stopping core services",
    action: "stop",
    run: (onOutput) => stopCoreStack(onOutput),
  });
}

export async function restartCore() {
  return runCoreLifecycle({
    title: "Restarting core services",
    action: "restart",
    run: (onOutput) => restartCoreStack(onOutput),
  });
}
