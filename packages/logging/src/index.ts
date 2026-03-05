import { configure, getConsoleSink, getLogger as getLogTapeLogger } from "@logtape/logtape";

export async function configureLogging() {
  await configure({
    sinks: {
      console: getConsoleSink(),
    },
    loggers: [
      {
        category: "laber",
        sinks: ["console"],
        lowestLevel: "info",
      },
    ],
  });
}

export function getLogger(category: string[]) {
  return getLogTapeLogger(category);
}
