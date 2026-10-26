import {
  configureSync,
  getConfig,
  getConsoleSink,
  getLogger as getLogTapeLogger,
  getTextFormatter,
} from "@logtape/logtape";

const ROOT = "laber";

function ensureConfigured(): void {
  if (getConfig() !== null) return;
  configureSync({
    sinks: {
      console: getConsoleSink({ formatter: getTextFormatter() }),
    },
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
