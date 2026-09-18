import { StatusBadge } from "@laber/ui";

type LogEntry = {
  id: string;
  status: string;
  action: string;
  output: string | null;
  createdAt: Date | string | null;
};

export default function StackDeploymentLogs({
  logs,
}: {
  logs: LogEntry[];
}) {
  if (logs.length === 0) {
    return (
      <p className="text-text-muted text-sm">No deployment history</p>
    );
  }
  return (
    <div className="space-y-2">
      {logs.map((log) => (
        <div
          key={log.id}
          className="bg-surface-2 border-border rounded-lg border px-4 py-3"
        >
          <div className="flex items-center gap-3 text-sm">
            <StatusBadge status={log.status} />
            <span className="text-text-secondary font-mono">
              {log.action}
            </span>
            <span className="text-text-muted ml-auto text-xs">
              {log.createdAt
                ? new Date(log.createdAt).toLocaleString()
                : ""}
            </span>
          </div>
          {log.output && (
            <pre className="text-text-muted bg-surface-0 mt-2 max-h-32 overflow-auto rounded p-2 font-mono text-xs">
              {log.output}
            </pre>
          )}
        </div>
      ))}
    </div>
  );
}
