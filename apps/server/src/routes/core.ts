import { Elysia } from "elysia";
import * as v from "valibot";
import {
  getCoreOverview,
  saveCoreConfig,
  deployCore,
  stopCore,
  restartCore,
} from "../lib/core-stack";
import { CORE_KEYS, type CoreKey } from "../lib/core-keys";

const saveCoreConfigSchema = v.record(
  v.picklist(CORE_KEYS.map((k) => k.key) as [CoreKey, ...CoreKey[]]),
  v.optional(v.nullable(v.string()))
);

export const coreRoutes = new Elysia()
  .get("/api/core", async () => {
    return getCoreOverview();
  })
  .put(
    "/api/core/config",
    async ({ body }) => {
      return saveCoreConfig(body);
    },
    { body: saveCoreConfigSchema }
  )
  .post("/api/core/deploy", async () => {
    return deployCore();
  })
  .post("/api/core/stop", async () => {
    return stopCore();
  })
  .post("/api/core/restart", async () => {
    return restartCore();
  });
