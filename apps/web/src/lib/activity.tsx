import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type ActivityStatus = "running" | "success" | "error";

export interface Activity {
  id: string;
  title: string;
  status: ActivityStatus;
  output: string;
  startedAt: number;
  finishedAt?: number;
}

type ActivityEvent =
  | { type: "init"; activities: Activity[] }
  | { type: "start"; activity: Activity }
  | { type: "output"; id: string; chunk: string }
  | {
      type: "finish";
      id: string;
      status: "success" | "error";
      finishedAt: number;
    };

interface ActivityContextValue {
  activities: Activity[];
  open: boolean;
  setOpen: (open: boolean) => void;
  hasRunning: boolean;
  runningCount: number;
  clear: () => void;
}

const ActivityContext = createContext<ActivityContextValue>({
  activities: [],
  open: false,
  setOpen: () => {},
  hasRunning: false,
  runningCount: 0,
  clear: () => {},
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isActivity(value: unknown): value is Activity {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.title === "string" &&
    (value.status === "running" ||
      value.status === "success" ||
      value.status === "error") &&
    typeof value.output === "string" &&
    typeof value.startedAt === "number" &&
    (value.finishedAt === undefined || typeof value.finishedAt === "number")
  );
}

/**
 * The SSE stream is `any` JSON: unknown shapes are ignored loudly, never
 * applied (a wrong `type` on the finish path would stall the panel).
 */
function isActivityEvent(value: unknown): value is ActivityEvent {
  if (!isRecord(value)) return false;
  switch (value.type) {
    case "init":
      return (
        Array.isArray(value.activities) &&
        value.activities.every(isActivity)
      );
    case "start":
      return isActivity(value.activity);
    case "output":
      return typeof value.id === "string" && typeof value.chunk === "string";
    case "finish":
      return (
        typeof value.id === "string" &&
        (value.status === "success" || value.status === "error") &&
        typeof value.finishedAt === "number"
      );
    default:
      return false;
  }
}

function applyEvent(prev: Activity[], event: ActivityEvent): Activity[] {
  switch (event.type) {
    case "init":
      return event.activities;
    case "start":
      return [event.activity, ...prev].slice(0, 50);
    case "output":
      return prev.map((a) =>
        a.id === event.id ? { ...a, output: a.output + event.chunk } : a,
      );
    case "finish":
      return prev.map((a) =>
        a.id === event.id
          ? { ...a, status: event.status, finishedAt: event.finishedAt }
          : a,
      );
    default: {
      // A new variant fails to compile here until it gets its own arm above.
      const _exhaustive: never = event;
      void _exhaustive;
      return prev;
    }
  }
}

export function ActivityProvider({ children }: { children: ReactNode }) {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [open, setOpen] = useState(false);
  const esRef = useRef<EventSource | null>(null);
  const openRef = useRef(false);
  openRef.current = open;

  useEffect(() => {
    let stopped = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const handle = (raw: MessageEvent) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw.data);
      } catch {
        // Malformed frames signal a server/stream bug; never swallow silently.
        console.warn("[activity] ignoring malformed frame", raw.data);
        return;
      }
      if (!isActivityEvent(parsed)) {
        console.warn("[activity] ignoring unknown event shape", raw.data);
        return;
      }
      setActivities((prev) => applyEvent(prev, parsed));
      if (parsed.type === "start" && !openRef.current) setOpen(true);
    };

    const connect = () => {
      if (stopped || esRef.current) return;
      const es = new EventSource("/api/activity/stream");
      esRef.current = es;
      for (const type of ["init", "start", "output", "finish"]) {
        es.addEventListener(type, handle as EventListener);
      }
      es.onerror = () => {
        es.close();
        esRef.current = null;
        if (!stopped) retryTimer = setTimeout(connect, 3000);
      };
    };

    connect();
    return () => {
      stopped = true;
      if (retryTimer) clearTimeout(retryTimer);
      esRef.current?.close();
      esRef.current = null;
    };
  }, []);

  const clear = useCallback(() => {
    setActivities((prev) => prev.filter((a) => a.status === "running"));
  }, []);

  const value = useMemo<ActivityContextValue>(() => {
    const running = activities.filter(
      (a) => a.status === "running"
    ).length;
    return {
      activities,
      open,
      setOpen,
      hasRunning: running > 0,
      runningCount: running,
      clear,
    };
  }, [activities, open, clear]);

  return (
    <ActivityContext.Provider value={value}>
      {children}
    </ActivityContext.Provider>
  );
}

export function useActivity() {
  return useContext(ActivityContext);
}
