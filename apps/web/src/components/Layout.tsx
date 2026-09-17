import { useState } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { Icon } from "@laber/ui";
import { signOut, useSession } from "@/lib/auth";
import { useTheme } from "@/lib/theme";
import { useActivity } from "@/lib/activity";
import ActivityPanel from "@/components/ActivityPanel";

const nav = [
  { to: "/", label: "Dashboard", icon: "grid" },
  { to: "/stacks", label: "Stacks", icon: "layers" },
  { to: "/core", label: "Core Services", icon: "cpu" },
] as const;

const bottomNav = [
  { to: "/settings/repository", label: "Repository", icon: "settings" },
] as const;

function NavIcon({ icon }: { icon: string }) {
  if (icon === "grid") {
    return (
      <>
        <rect x="1.5" y="1.5" width="5" height="5" rx="1" />
        <rect x="9.5" y="1.5" width="5" height="5" rx="1" />
        <rect x="1.5" y="9.5" width="5" height="5" rx="1" />
        <rect x="9.5" y="9.5" width="5" height="5" rx="1" />
      </>
    );
  }
  if (icon === "layers") {
    return (
      <>
        <path d="M8 1.5L14.5 5.5L8 9.5L1.5 5.5Z" />
        <path d="M1.5 8L8 12L14.5 8" />
        <path d="M1.5 10.5L8 14.5L14.5 10.5" />
      </>
    );
  }
  if (icon === "cpu") {
    return (
      <>
        <rect x="4" y="4" width="8" height="8" rx="1" />
        <path d="M6.5 1.5V4M9.5 1.5V4M6.5 12V14.5M9.5 12V14.5M1.5 6.5H4M1.5 9.5H4M12 6.5H14.5M12 9.5H14.5" />
      </>
    );
  }
  return (
    <>
      <circle cx="8" cy="8" r="3" />
      <path d="M5 2.5L6.5 5M11 2.5L9.5 5M2.5 5L5 6.5M2.5 11L5 9.5M5 13.5L6.5 11M11 13.5L9.5 11M13.5 5L11 6.5M13.5 11L11 9.5" />
    </>
  );
}

function useIsActive(href: string) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  if (href === "/") return pathname === "/";
  return pathname.startsWith(href);
}

function NavLink({
  to,
  label,
  icon,
}: {
  to: string;
  label: string;
  icon: string;
}) {
  const active = useIsActive(to);
  return (
    <Link
      to={to}
      className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
        active
          ? "bg-surface-3 text-text-primary"
          : "text-text-secondary hover:bg-surface-2 hover:text-text-primary"
      }`}
    >
      <Icon className="opacity-60">
        <NavIcon icon={icon} />
      </Icon>
      {label}
    </Link>
  );
}

export default function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { theme, toggle } = useTheme();
  const { hasRunning, setOpen } = useActivity();
  const { data: session } = useSession();
  const navigate = useNavigate();
  const user = session?.user;

  async function handleSignOut() {
    await signOut({
      fetchOptions: {
        onSuccess: () => {
          navigate({ to: "/login" });
        },
      },
    });
  }

  const sidebarContent = (
    <>
      <div className="border-border flex items-center gap-2 border-b px-5 py-4">
        <span className="font-mono text-lg font-bold tracking-tight">
          laber
        </span>
        <span className="bg-accent/10 text-accent rounded px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase">
          homelab
        </span>
      </div>

      <nav className="flex-1 space-y-0.5 p-3">
        {nav.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            label={item.label}
            icon={item.icon}
          />
        ))}
      </nav>

      <div className="border-border space-y-0.5 border-t p-3">
        {bottomNav.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            label={item.label}
            icon={item.icon}
          />
        ))}
        <button
          onClick={() => setOpen(true)}
          className="text-text-secondary hover:bg-surface-2 hover:text-text-primary relative flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors"
        >
          <Icon className="opacity-60">
            <path d="M8 1.5v5l3 1.5" />
            <circle cx="8" cy="8" r="6.5" />
          </Icon>
          Activity
          {hasRunning && (
            <span className="bg-accent ml-auto h-2 w-2 rounded-full">
              <span className="bg-accent absolute inset-0 h-2 w-2 animate-ping rounded-full opacity-75"></span>
            </span>
          )}
        </button>
      </div>

      <div className="border-border border-t px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-text-primary truncate text-sm font-medium">
              {user?.name ?? ""}
            </p>
            <p className="text-text-muted truncate text-xs">
              {user?.email ?? ""}
            </p>
          </div>
          <div className="flex items-center gap-0.5">
            <button
              onClick={toggle}
              className="text-text-muted hover:text-text-primary rounded-md p-1.5 transition-colors"
              title="Toggle theme"
            >
              {theme === "dark" ? (
                <Icon>
                  <circle cx="8" cy="8" r="3.5" />
                  <path d="M8 1.5v1M8 13.5v1M1.5 8h1M13.5 8h1M3.4 3.4l.7.7M11.9 11.9l.7.7M3.4 12.6l.7-.7M11.9 4.1l.7-.7" />
                </Icon>
              ) : (
                <Icon>
                  <path d="M13.5 8.5a5.5 5.5 0 01-7-7 5.5 5.5 0 107 7z" />
                </Icon>
              )}
            </button>
            <button
              onClick={handleSignOut}
              className="text-text-muted hover:text-danger rounded-md p-1.5 transition-colors"
              title="Sign out"
            >
              <Icon>
                <path d="M6 14H3a1 1 0 01-1-1V3a1 1 0 011-1h3M11 11l3-3-3-3M6 8h8" />
              </Icon>
            </button>
          </div>
        </div>
      </div>
    </>
  );

  return (
    <div
      className="flex h-dvh overflow-hidden"
      onClick={() => setSidebarOpen(false)}
    >
      <aside className="bg-surface-1 border-border hidden w-60 shrink-0 flex-col border-r md:flex">
        {sidebarContent}
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
            {sidebarContent}
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
