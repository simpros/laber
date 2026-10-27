import { Link } from "@tanstack/react-router";
import { Card, CardHeader, StatusBadge } from "@laber/ui";
import { statusColor, timeAgo } from "@/lib/utils";
import { logTone } from "@/lib/status-tone";
import { useDashboard } from "@/lib/queries/dashboard";
import QueryStatus from "@/components/QueryStatus";

export default function DashboardPage() {
  const query = useDashboard();

  return (
    <QueryStatus query={query} failedMessage="Failed to load dashboard">
      {(data) => (
        <div className="space-y-8">
          <div className="animate-rise">
            <h1 className="text-2xl font-semibold tracking-tight">
              Dashboard
            </h1>
            <p className="text-text-secondary mt-1 text-sm">
              Overview of your homelab infrastructure
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Card
              className="animate-rise p-5"
              style={{ animationDelay: "60ms" }}
            >
              <p className="text-text-muted text-xs font-medium tracking-wider uppercase">
                Total Stacks
              </p>
              <p className="mt-2 font-mono text-3xl font-bold tabular-nums">
                {data.stats.totalStacks}
              </p>
            </Card>
            <Card
              className="animate-rise p-5"
              style={{ animationDelay: "110ms" }}
            >
              <p className="text-text-muted text-xs font-medium tracking-wider uppercase">
                Deployed
              </p>
              <p className="text-success mt-2 font-mono text-3xl font-bold tabular-nums">
                {data.stats.deployedStacks}
              </p>
            </Card>
            <Card
              className="animate-rise p-5"
              style={{ animationDelay: "160ms" }}
            >
              <p className="text-text-muted text-xs font-medium tracking-wider uppercase">
                Repositories
              </p>
              <p className="mt-2 font-mono text-3xl font-bold tabular-nums">
                {data.stats.repositories}
              </p>
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card
              className="animate-rise"
              style={{ animationDelay: "220ms" }}
            >
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
                        className="bg-surface-1 hover:bg-surface-3/60 flex items-center justify-between rounded-lg px-3 py-2.5 transition-colors duration-150"
                      >
                        <span className="font-mono text-sm">
                          {svc.name}
                        </span>
                        <span
                          className={`inline-flex items-center gap-1.5 text-xs font-medium ${statusColor(svc.state)}`}
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-current"></span>
                          {svc.state}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Card>

            <Card
              className="animate-rise"
              style={{ animationDelay: "270ms" }}
            >
              <CardHeader title="Recent Activity" />
              <div className="p-5">
                {data.recentLogs.length === 0 ? (
                  <p className="text-text-muted text-sm">
                    No deployments yet
                  </p>
                ) : (
                  <div className="space-y-2">
                    {data.recentLogs.map((log) => (
                      <div
                        key={log.id}
                        className="flex items-center gap-3 text-sm"
                      >
                        <StatusBadge tone={logTone(log.status)}>
                          {log.status}
                        </StatusBadge>
                        <span className="text-text-secondary">
                          {log.isCore
                            ? "core"
                            : (log.stackId ?? "unknown")}
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
      )}
    </QueryStatus>
  );
}
