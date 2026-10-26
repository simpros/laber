import { StatusBadge } from "@laber/ui";
import { logTone } from "@/lib/status-tone";
import type { StackDeploymentLog } from "@/lib/queries/stacks";

export default function StackDeploymentLogs({
  logs,
}: {
  logs: StackDeploymentLog[];
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
            <StatusBadge tone={logTone(log.status)}>
              {log.status}
            </StatusBadge>
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
