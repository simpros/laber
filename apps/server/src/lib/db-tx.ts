import type { Db } from "@laber/db";

/**
 * The Drizzle sync-transaction handle. Lives here (next to `@laber/db`,
 * not in a feature module) so persistence code never imports the VCS module
 * for a database concept.
 */
export type StackTx = Parameters<Parameters<Db["transaction"]>[0]>[0];
