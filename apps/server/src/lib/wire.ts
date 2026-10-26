import type { deploymentLogs } from "@laber/db";

// DB timestamp columns arrive as Date, but the JSON wire carries ISO
// strings. Map rows at the fetch boundary so Eden infers the shape
// clients actually receive. Only deployment-log rows are mapped here;
// other Date-bearing rows (stacks, env vars, repositories) still type
// as Date while the wire carries ISO strings — pre-existing, follow-up.
export const toWireLog = (row: typeof deploymentLogs.$inferSelect) => ({
  ...row,
  createdAt: row.createdAt.toISOString(),
});
