import { useEffect, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { Icon } from "@laber/ui";
import { useActivity } from "@/lib/activity";
import ActivityPanel from "@/components/ActivityPanel";
import AppSidebar from "@/components/AppSidebar";

export default function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { hasRunning, setOpen } = useActivity();
  // The drawer is navigation chrome: close it whenever the route changes
  // (in addition to per-link close) so it never survives a navigation.
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  return (
    <div
      className="flex h-dvh overflow-hidden"
      onClick={() => setSidebarOpen(false)}
    >
      <aside className="bg-surface-1 border-border hidden w-60 shrink-0 flex-col border-r md:flex">
        <AppSidebar />
      </aside>

      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 md:hidden"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="absolute inset-0 bg-black/50"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close sidebar"
          ></button>
          <aside className="bg-surface-1 border-border relative z-50 flex h-full w-60 flex-col border-r">
            <AppSidebar onNavigate={() => setSidebarOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col [contain:paint]">
        <header className="bg-surface-1 border-border flex items-center gap-3 border-b px-4 py-3 md:hidden">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setSidebarOpen(true);
            }}
            className="text-text-secondary hover:text-text-primary -ml-1 rounded-md p-1 transition-colors"
            aria-label="Open sidebar"
          >
            <Icon>
              <path d="M2 4h12M2 8h12M2 12h12" />
            </Icon>
          </button>
          <span className="font-mono text-sm font-bold tracking-tight">
            laber
          </span>
          <button
            onClick={() => setOpen(true)}
            className="text-text-secondary hover:text-text-primary relative ml-auto rounded-md p-1 transition-colors"
            aria-label="Open activity panel"
          >
            <Icon>
              <path d="M8 1.5v5l3 1.5" />
              <circle cx="8" cy="8" r="6.5" />
            </Icon>
            {hasRunning && (
              <span className="bg-accent absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full"></span>
            )}
          </button>
        </header>

        <main className="flex-1 overflow-y-auto">
          <div className="p-4 sm:p-6 md:p-8">{children}</div>
        </main>
      </div>

      <ActivityPanel />
    </div>
  );
}
