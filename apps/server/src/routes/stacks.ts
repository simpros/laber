import { Elysia } from "elysia";
import * as v from "valibot";
import {
  listStacks,
  getStackDetail,
  deployStackByName,
  runStackLifecycle,
  replaceStackEnv,
  replaceStackSecrets,
  saveComposeContent,
} from "../lib/stacks";

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
    return runStackLifecycle({
      name: params.name,
      title: `Stopping ${params.name}`,
      action: "stop",
      command: ["down"],
      statusOnSuccess: "stopped",
    });
  })
  .post("/api/stacks/:name/restart", async ({ params }) => {
    return runStackLifecycle({
      name: params.name,
      title: `Restarting ${params.name}`,
      action: "restart",
      command: ["restart"],
    });
  })
  .post("/api/stacks/:name/pull", async ({ params }) => {
    return runStackLifecycle({
      name: params.name,
      title: `Pulling images for ${params.name}`,
      action: "pull",
      command: ["pull"],
    });
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
