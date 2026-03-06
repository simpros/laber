export function statusColor(state: string) {
  if (state === "running") return "text-success";
  if (state === "exited" || state === "stopped") return "text-warning";
  return "text-danger";
}

export function containerStatusBg(state: string) {
  if (state === "running") return "bg-success/10 border-success/20";
  if (state === "exited") return "bg-warning/10 border-warning/20";
  return "bg-danger/10 border-danger/20";
}

export function statusBadge(status: string) {
  const map: Record<string, string> = {
    deployed: "bg-success/10 text-success",
    stopped: "bg-warning/10 text-warning",
    error: "bg-danger/10 text-danger",
    discovered: "bg-surface-3 text-text-secondary",
  };
  return map[status] ?? map.discovered;
}

export function timeAgo(date: Date | string | null) {
  if (!date) return "never";
  const d = typeof date === "string" ? new Date(date) : date;
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
