import type { Db } from "@laber/db";

/** Drizzle sync-transaction handle, kept out of feature modules. */
export type StackTx = Parameters<Parameters<Db["transaction"]>[0]>[0];
