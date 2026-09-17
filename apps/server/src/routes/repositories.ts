import { Elysia } from "elysia";
import * as v from "valibot";
import { db, repositories, stacks } from "@laber/db";
import {
  cloneAndRegisterRepo,
  syncRepository,
  deleteRepository,
} from "../lib/repositories";

const addRepositoryBodySchema = v.object({
  name: v.pipe(v.string(), v.nonEmpty()),
  url: v.pipe(v.string(), v.nonEmpty()),
  branch: v.optional(v.string(), "main"),
  stacksPath: v.optional(v.string(), "stacks"),
  sshPrivateKey: v.optional(v.nullable(v.string()), null),
});

export const repositoryRoutes = new Elysia()
  .get("/api/repositories", async () => {
    const repos = await db.select().from(repositories);
    const allStacks = await db.select().from(stacks);

    return { repositories: repos, stacks: allStacks };
  })
  .post(
    "/api/repositories",
    async ({ body, set }) => {
      const result = await cloneAndRegisterRepo({
        name: body.name,
        url: body.url,
        branch: body.branch,
        stacksPath: body.stacksPath,
        sshPrivateKey: body.sshPrivateKey,
      });

      set.status = 201;
      return result;
    },
    { body: addRepositoryBodySchema }
  )
  .post("/api/repositories/:id/sync", async ({ params }) => {
    return syncRepository(params.id);
  })
  .delete("/api/repositories/:id", async ({ params }) => {
    return deleteRepository(params.id);
  });
