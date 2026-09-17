import { writeFileSync, renameSync, rmSync } from "fs";
import { sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { ValidationError } from "./errors";
import { db, coreConfig } from "@laber/db";
import { listContainersSoft } from "./docker-engine";
import { downProject } from "./compose-cli";
import { runLoggedDeploy } from "./compose-actions";
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
  // One success contract for disk + runtime: the generated compose is part
  // of the deploy attempt. Prepare to a temp file in the same directory
  // (same `cwd` + relative-path resolution) and run `up -d` from the temp —
  // the live file advances only after a successful attempt. A failed `up` /
  // Traefik attach leaves the previous template untouched, so there is no
  // outer restore catch and no second compensation layer: `deployStack`
  // already owns secret wipe + compensating `down` for the attempt.
  const content = getCoreComposeContent(config);
  const tempPath = `${composePath}.deploy-${nanoid(8)}.tmp`;
  writeFileSync(tempPath, content, "utf-8");

  const envVars: Record<string, string> = {
    CF_DNS_API_TOKEN: config.cfDnsApiToken,
  };
  if (config.tunnelToken) {
    envVars.TUNNEL_TOKEN = config.tunnelToken;
  }

  try {
    const result = await runLoggedDeploy({
      title: "Deploying core services",
      action: "deploy",
      identity: { kind: "core" },
      failureMessage: "Deploying core services failed",
      deploy: {
        composePath: tempPath,
        envVars,
        projectName: CORE_PROJECT,
      },
    });
    try {
      renameSync(tempPath, composePath);
    } catch (e) {
      // Runtime advanced from the temp file but the live template could not
      // advance: unwind the containers so disk + runtime stay consistent
      // (both old), then throw. A half-live core project is worse than none.
      try {
        await downProject({
          projectName: CORE_PROJECT,
          composePath: tempPath,
        });
      } catch {
        // the rename error is what matters
      }
      try {
        rmSync(tempPath, { force: true });
      } catch {
        // ignore cleanup errors
      }
      throw e;
    }
    return result;
  } catch (e) {
    try {
      rmSync(tempPath, { force: true });
    } catch {
      // best-effort temp cleanup: the deploy error is what matters
    }
    throw e;
  }
}
