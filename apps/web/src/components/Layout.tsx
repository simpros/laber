import { useEffect, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { Icon } from "@laber/ui";
import ActivityPanel from "@/components/ActivityPanel";
import AppSidebar, { ActivityLauncher } from "@/components/AppSidebar";

export default function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // Close the drawer on navigation so it never survives a route change.
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
          <ActivityLauncher iconOnly />
        </header>

        <main className="flex-1 overflow-y-auto">
          <div className="p-4 sm:p-6 md:p-8">{children}</div>
        </main>
      </div>

      <ActivityPanel />
    </div>
  );
}
