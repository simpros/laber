import { Elysia } from "elysia";
import * as v from "valibot";
import {
  listStacks,
  getStackDetail,
  deployStackByName,
} from "../lib/stacks";
import { runStackOp } from "../lib/compose-actions";
import {
  replaceStackEnv,
  replaceStackSecrets,
  saveComposeContent,
} from "../lib/stack-config";

const saveEnvBodySchema = v.object({
  entries: v.array(
    v.object({
      key: v.string(),
      value: v.nullable(v.string()),
      isSecret: v.boolean(),
    })
  ),
});

const saveSecretsBodySchema = v.object({
  entries: v.array(
    v.object({
      name: v.string(),
      value: v.nullable(v.string()),
    })
  ),
});

const saveComposeBodySchema = v.object({
  content: v.pipe(
    v.string(),
    v.nonEmpty("Compose content must not be empty")
  ),
});

export const stackRoutes = new Elysia()
  .get("/api/stacks", async () => {
    return listStacks();
  })
  .get("/api/stacks/:name", async ({ params }) => {
    return getStackDetail(params.name);
  })
  .post("/api/stacks/:name/deploy", async ({ params }) => {
    return deployStackByName(params.name);
  })
  .post("/api/stacks/:name/stop", async ({ params }) => {
    return runStackOp(params.name, "stop");
  })
  .post("/api/stacks/:name/restart", async ({ params }) => {
    return runStackOp(params.name, "restart");
  })
  .post("/api/stacks/:name/pull", async ({ params }) => {
    return runStackOp(params.name, "pull");
  })
  .put(
    "/api/stacks/:name/compose",
    async ({ params, body }) => {
      return saveComposeContent(params.name, body.content);
    },
    { body: saveComposeBodySchema }
  )
  .put(
    "/api/stacks/:name/env",
    async ({ params, body }) => {
      return replaceStackEnv(params.name, body.entries);
    },
    { body: saveEnvBodySchema }
  )
  .put(
    "/api/stacks/:name/secrets",
    async ({ params, body }) => {
      return replaceStackSecrets(params.name, body.entries);
    },
    { body: saveSecretsBodySchema }
  );
