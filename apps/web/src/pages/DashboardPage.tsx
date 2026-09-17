import { Link } from "@tanstack/react-router";
import { Card, CardHeader, StatusBadge } from "@laber/ui";
import { statusColor, timeAgo } from "@/lib/utils";
import { useDashboard } from "@/lib/queries/dashboard";

export default function DashboardPage() {
  const { data, isLoading, isError, error } = useDashboard();

  if (isLoading)
    return <p className="text-text-muted text-sm">Loading…</p>;
  if (isError || !data)
    return (
      <p className="text-danger text-sm">
        {error instanceof Error
          ? error.message
          : "Failed to load dashboard"}
      </p>
    );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-text-secondary mt-1 text-sm">
          Overview of your homelab infrastructure
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="p-5">
          <p className="text-text-muted text-xs font-medium tracking-wider uppercase">
            Total Stacks
          </p>
          <p className="mt-1 font-mono text-3xl font-bold">
            {data.stats.totalStacks}
          </p>
        </Card>
        <Card className="p-5">
          <p className="text-text-muted text-xs font-medium tracking-wider uppercase">
            Deployed
          </p>
          <p className="text-success mt-1 font-mono text-3xl font-bold">
            {data.stats.deployedStacks}
          </p>
        </Card>
        <Card className="p-5">
          <p className="text-text-muted text-xs font-medium tracking-wider uppercase">
            Repositories
          </p>
          <p className="mt-1 font-mono text-3xl font-bold">
            {data.stats.repositories}
          </p>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Core Services" />
          <div className="p-5">
            {!data.coreConfigured ? (
              <div className="py-4 text-center">
                <p className="text-text-secondary text-sm">
                  Core stack not configured
                </p>
                <Link
                  to="/core"
                  className="text-accent hover:text-accent-hover mt-2 inline-block text-sm"
                >
                  Configure now
                </Link>
              </div>
            ) : data.coreServices.length === 0 ? (
              <p className="text-text-muted text-sm">
                No core containers running
              </p>
            ) : (
              <div className="space-y-2.5">
                {data.coreServices.map((svc) => (
                  <div
                    key={svc.name}
                    className="bg-surface-1 flex items-center justify-between rounded-lg px-3 py-2.5"
                  >
                    <span className="font-mono text-sm">{svc.name}</span>
                    <span
                      className={`text-xs font-medium ${statusColor(svc.state)}`}
                    >
                      {svc.state}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Recent Activity" />
          <div className="p-5">
            {data.recentLogs.length === 0 ? (
              <p className="text-text-muted text-sm">No deployments yet</p>
            ) : (
              <div className="space-y-2">
                {data.recentLogs.map((log) => (
                  <div
                    key={log.id}
                    className="flex items-center gap-3 text-sm"
                  >
                    <StatusBadge status={log.status} />
                    <span className="text-text-secondary">
                      {log.isCore ? "core" : (log.stackId ?? "unknown")}
                    </span>
                    <span className="text-text-muted font-mono text-xs">
                      {log.action}
                    </span>
                    <span className="text-text-muted ml-auto text-xs">
                      {log.createdAt ? timeAgo(log.createdAt) : ""}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
