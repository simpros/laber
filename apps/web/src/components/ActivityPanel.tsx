import { useEffect, useRef } from "react";
import { Icon } from "@laber/ui";
import { useActivity } from "@/lib/activity";

function elapsed(startedAt: number, finishedAt?: number) {
  const ms = (finishedAt ?? Date.now()) - startedAt;
  const secs = Math.round(ms / 1000);
  if (secs < 60) return `${secs}s`;
  return `${Math.floor(secs / 60)}m ${secs % 60}s`;
}

export default function ActivityPanel() {
  const { activities, open, setOpen, hasRunning, runningCount, clear } =
    useActivity();
  const panelBody = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const first = activities[0];
    if (first?.status === "running" && first.output) {
      const el = panelBody.current?.querySelector<HTMLElement>(
        "[data-active-output]"
      );
      if (el) el.scrollTop = el.scrollHeight;
    }
  }, [activities]);

  return (
    <>
      {open && (
        <button
          className="fixed inset-0 z-40 bg-black/30 transition-opacity"
          onClick={() => setOpen(false)}
          aria-label="Close activity panel"
        ></button>
      )}

      <div
        className={`bg-surface-1 border-border fixed top-0 right-0 z-50 flex h-dvh w-[420px] max-w-[90vw] flex-col border-l shadow-2xl transition-transform duration-200 ease-out ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="border-border flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <Icon className="opacity-60">
              <path d="M8 1.5v5l3 1.5" />
              <circle cx="8" cy="8" r="6.5" />
            </Icon>
            <span className="text-sm font-semibold">Activity</span>
            {hasRunning && (
              <span className="bg-accent/15 text-accent rounded px-1.5 py-0.5 text-[10px] font-medium">
                {runningCount} running
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {activities.length > 0 && !hasRunning && (
              <button
                onClick={clear}
                className="text-text-muted hover:text-text-secondary rounded-md p-1.5 text-xs transition-colors"
                title="Clear completed"
              >
                Clear
              </button>
            )}
            <button
              onClick={() => setOpen(false)}
              className="text-text-muted hover:text-text-primary rounded-md p-1.5 transition-colors"
              title="Close panel"
            >
              <Icon>
                <path d="M4 4l8 8M12 4l-8 8" />
              </Icon>
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto" ref={panelBody}>
          {activities.length === 0 ? (
            <div className="flex h-full items-center justify-center">
              <p className="text-text-muted text-sm">No recent activity</p>
            </div>
          ) : (
            <div className="divide-border divide-y">
              {activities.map((activity) => (
                <div key={activity.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      {activity.status === "running" ? (
                        <span className="bg-accent relative mt-0.5 h-2 w-2 shrink-0 rounded-full">
                          <span className="bg-accent absolute inset-0 animate-ping rounded-full opacity-75"></span>
                        </span>
                      ) : activity.status === "success" ? (
                        <Icon size="sm" className="text-success shrink-0">
                          <path d="M3.5 8.5l3 3 6-7" />
                        </Icon>
                      ) : (
                        <Icon size="sm" className="text-danger shrink-0">
                          <circle cx="8" cy="8" r="5.5" />
                          <path d="M8 5.5v3M8 10.5v.5" />
                        </Icon>
                      )}
                      <span className="truncate font-mono text-xs font-medium">
                        {activity.title}
                      </span>
                    </div>
                    <span className="text-text-muted shrink-0 text-[10px] tabular-nums">
                      {elapsed(activity.startedAt, activity.finishedAt)}
                    </span>
                  </div>
                  {activity.output && (
                    <pre
                      data-active-output={
                        activity.status === "running" ? "" : undefined
                      }
                      className="bg-surface-0 border-border text-text-secondary mt-2 max-h-48 overflow-y-auto rounded-lg border p-3 font-mono text-[11px] leading-relaxed break-all whitespace-pre-wrap"
                    >
                      {activity.output.trimEnd()}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
