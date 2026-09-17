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
      status: ActivityStatus;
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

function applyEvent(prev: Activity[], event: ActivityEvent): Activity[] {
  if (event.type === "init") return event.activities;
  if (event.type === "start")
    return [event.activity, ...prev].slice(0, 50);
  if (event.type === "output") {
    return prev.map((a) =>
      a.id === event.id ? { ...a, output: a.output + event.chunk } : a
    );
  }
  return prev.map((a) =>
    a.id === event.id
      ? { ...a, status: event.status, finishedAt: event.finishedAt }
      : a
  );
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
      try {
        const event = JSON.parse(raw.data) as ActivityEvent;
        setActivities((prev) => applyEvent(prev, event));
        if (event.type === "start" && !openRef.current) setOpen(true);
      } catch {
        // ignore malformed frames
      }
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
