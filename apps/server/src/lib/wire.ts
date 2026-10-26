// DB timestamp columns materialize as Date; the JSON wire carries ISO
// strings. Rows cross the wire through a mapper here.
import type { deploymentLogs } from "@laber/db";

export const toWireLog = (row: typeof deploymentLogs.$inferSelect) => ({
  ...row,
  createdAt: row.createdAt.toISOString(),
});

type Timestamped = { createdAt: Date; updatedAt: Date };

const withWireTimestamps = <T extends Timestamped>(row: T) => ({
  ...row,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

export const toWireStack = withWireTimestamps;

export const toWireEnvVar = withWireTimestamps;

export const toWireRepository = <
  T extends Timestamped & {
    lastSyncedAt: Date | null;
  },
>(
  row: T
) => ({
  ...withWireTimestamps(row),
  lastSyncedAt: row.lastSyncedAt?.toISOString() ?? null,
});
