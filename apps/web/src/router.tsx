import {
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
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

async function getSetupStatus(): Promise<{ needsSetup: boolean }> {
  try {
    const res = await fetch("/api/setup/status", {
      credentials: "same-origin",
    });
    if (!res.ok) return { needsSetup: false };
    return (await res.json()) as { needsSetup: boolean };
  } catch {
    return { needsSetup: false };
  }
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

const rootRoute = createRootRoute({
  component: () => <Outlet />,
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  beforeLoad: async () => {
    const [{ needsSetup }, user] = await Promise.all([
      getSetupStatus(),
      getSessionUser(),
    ]);
    if (needsSetup) throw redirect({ to: "/setup" });
    if (user) throw redirect({ to: "/" });
  },
  component: LoginPage,
});

const setupRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/setup",
  beforeLoad: async () => {
    const [{ needsSetup }, user] = await Promise.all([
      getSetupStatus(),
      getSessionUser(),
    ]);
    if (!needsSetup && user) throw redirect({ to: "/" });
    if (!needsSetup && !user) throw redirect({ to: "/login" });
  },
  component: SetupPage,
});

const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "app",
  beforeLoad: async () => {
    const [{ needsSetup }, user] = await Promise.all([
      getSetupStatus(),
      getSessionUser(),
    ]);
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

const stackDetailRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/stacks/$name",
  validateSearch: (search: Record<string, unknown>) => {
    const tab = search.tab;
    return {
      tab:
        tab === "services" ||
        tab === "env" ||
        tab === "secrets" ||
        tab === "compose" ||
        tab === "logs"
          ? tab
          : undefined,
    };
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
