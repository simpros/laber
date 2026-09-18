import type { Db } from "@laber/db";

export type StackTx = Parameters<Parameters<Db["transaction"]>[0]>[0];
