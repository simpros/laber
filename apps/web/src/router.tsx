import {
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
  useRouter,
  Outlet,
} from "@tanstack/react-router";
import { authClient } from "@/lib/auth";
import Layout from "@/components/Layout";
import DashboardPage from "@/pages/DashboardPage";
import StacksPage from "@/pages/StacksPage";
import StackDetailPage from "@/pages/StackDetailPage";
import CorePage from "@/pages/CorePage";
import RepositoryPage from "@/pages/RepositoryPage";
import LoginPage from "@/pages/LoginPage";
import SetupPage from "@/pages/SetupPage";

/**
 * Setup probe for the route guards. Fail-closed: any transport or shape
 * failure throws, so the router renders the error UI with a retry instead
 * of inventing `needsSetup: false` and misrouting to /login on a fresh DB.
 */
async function fetchSetupStatus(): Promise<{ needsSetup: boolean }> {
  let res: Response;
  try {
    res = await fetch("/api/setup/status", {
      credentials: "same-origin",
    });
  } catch (e) {
    throw new Error(
      `Setup status probe failed: ${e instanceof Error ? e.message : "network error"}`,
      { cause: e }
    );
  }
  if (!res.ok) {
    throw new Error(`Setup status probe failed: HTTP ${res.status}`);
  }
  const body: unknown = await res.json();
  if (
    typeof body !== "object" ||
    body === null ||
    !("needsSetup" in body) ||
    typeof body.needsSetup !== "boolean"
  ) {
    throw new Error("Setup status probe returned an unexpected shape");
  }
  return { needsSetup: body.needsSetup };
}

async function getSessionUser() {
  try {
    const { data } = await authClient.getSession({
      fetchOptions: { credentials: "include" },
    });
    return data?.user ?? null;
  } catch {
    return null;
  }
}

/** One redirect matrix for the three guards: probe + session together. */
async function loadGate() {
  const [{ needsSetup }, user] = await Promise.all([
    fetchSetupStatus(),
    getSessionUser(),
  ]);
  return { needsSetup, user };
}

function RootError() {
  const router = useRouter();
  return (
    <div className="flex h-dvh flex-col items-center justify-center gap-3 p-8 text-center">
      <p className="text-sm font-medium">
        Couldn&apos;t reach the server. Check that it&apos;s running and
        retry.
      </p>
      <button
        type="button"
        onClick={() => router.invalidate()}
        className="rounded-lg border px-4 py-2 text-sm"
      >
        Retry
      </button>
    </div>
  );
}

const rootRoute = createRootRoute({
  component: () => <Outlet />,
  errorComponent: () => <RootError />,
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  beforeLoad: async () => {
    const { needsSetup, user } = await loadGate();
    if (needsSetup) throw redirect({ to: "/setup" });
    if (user) throw redirect({ to: "/" });
  },
  component: LoginPage,
});

const setupRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/setup",
  beforeLoad: async () => {
    const { needsSetup, user } = await loadGate();
    if (!needsSetup && user) throw redirect({ to: "/" });
    if (!needsSetup && !user) throw redirect({ to: "/login" });
  },
  component: SetupPage,
});

const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "app",
  beforeLoad: async () => {
    const { needsSetup, user } = await loadGate();
    if (needsSetup) throw redirect({ to: "/setup" });
    if (!user) {
      throw redirect({ to: "/login" });
    }
  },
  component: () => (
    <Layout>
      <Outlet />
    </Layout>
  ),
});

const dashboardRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/",
  component: DashboardPage,
});

const stacksRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/stacks",
  component: StacksPage,
});

export const stackDetailRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/stacks/$name",
  validateSearch: (search: Record<string, unknown>) => {
    switch (search.tab) {
      case "services":
      case "env":
      case "secrets":
      case "compose":
      case "logs":
        return { tab: search.tab };
      default:
        return { tab: undefined };
    }
  },
  component: StackDetailPage,
});

const coreRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/core",
  component: CorePage,
});

const repositoryRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/settings/repository",
  component: RepositoryPage,
});

const routeTree = rootRoute.addChildren([
  loginRoute,
  setupRoute,
  appRoute.addChildren([
    dashboardRoute,
    stacksRoute,
    stackDetailRoute,
    coreRoute,
    repositoryRoute,
  ]),
]);

export const router = createRouter({
  routeTree,
  defaultPreload: "intent",
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
