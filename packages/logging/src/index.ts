import {
  configureSync,
  getConfig,
  getConsoleSink,
  getLogger as getLogTapeLogger,
  getTextFormatter,
} from "@logtape/logtape";

const ROOT = "laber";

let configured = false;

function renderValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (value instanceof Error) return value.stack ?? value.message;
  try {
    const json = JSON.stringify(value);
    return json === undefined ? String(value) : json;
  } catch {
    return String(value);
  }
}

function renderExtraProperties(
  rawMessage: string | TemplateStringsArray,
  properties: Record<string, unknown>
): string {
  const keys = Object.keys(properties);
  if (keys.length === 0) return "";
  const used = new Set<string>();
  if (typeof rawMessage === "string") {
    for (const match of rawMessage.matchAll(/\{([^{}]+)\}/g)) {
      used.add(match[1]);
    }
  }
  const rest = keys.filter((key) => !used.has(key));
  if (rest.length === 0) return "";
  return rest
    .map((key) => `${key}=${renderValue(properties[key])}`)
    .join(" ");
}

const consoleFormatter = getTextFormatter({
  format: ({ timestamp, level, category, message, record }) => {
    const head = `${timestamp ? `${timestamp} ` : ""}[${level}] ${category}: ${message}`;
    const extra = renderExtraProperties(
      record.rawMessage,
      record.properties
    );
    return extra === "" ? head : `${head} ${extra}`;
  },
});

function ensureConfigured(): void {
  if (configured) return;
  configured = true;
  if (getConfig() !== null) return;
  configureSync({
    sinks: { console: getConsoleSink({ formatter: consoleFormatter }) },
    loggers: [
      { category: ROOT, sinks: ["console"], lowestLevel: "info" },
      {
        category: ["logtape", "meta"],
        sinks: ["console"],
        lowestLevel: "warning",
      },
    ],
  });
}

export function getLogger(...parts: string[]) {
  ensureConfigured();
  return getLogTapeLogger([ROOT, ...parts]);
}

export function errorDetails(error: unknown): string {
  if (error instanceof Error) return error.stack ?? error.message;
  if (typeof error === "string") return error;
  try {
    const json = JSON.stringify(error);
    return json === undefined ? String(error) : json;
  } catch {
    return String(error);
  }
}
