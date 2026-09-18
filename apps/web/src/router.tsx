import {
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
  useRouter,
  Outlet,
} from "@tanstack/react-router";
import { authClient } from "@/lib/auth";
import { api, unwrap } from "@/lib/api";
import { ActivityProvider } from "@/lib/activity";
import Layout from "@/components/Layout";
import DashboardPage from "@/pages/DashboardPage";
import StacksPage from "@/pages/StacksPage";
import StackDetailPage, { type StackTab } from "@/pages/StackDetailPage";
import CorePage from "@/pages/CorePage";
import RepositoryPage from "@/pages/RepositoryPage";
import LoginPage from "@/pages/LoginPage";
import SetupPage from "@/pages/SetupPage";

/**
 * Setup probe for the route guards, over the same Eden client as every
 * other resource — one HTTP path, not a parallel hand-rolled fetch stack.
 * Fail-closed: any transport or shape failure throws, so the router renders
 * the error UI with a retry instead of inventing `needsSetup: false` and
 * misrouting to /login on a fresh DB.
 */
async function fetchSetupStatus(): Promise<{ needsSetup: boolean }> {
  let status: { needsSetup: boolean };
  try {
    status = unwrap(await api.api.setup.status.get());
  } catch (e) {
    throw new Error(
      `Setup status probe failed: ${e instanceof Error ? e.message : "network error"}`,
      { cause: e }
    );
  }
  if (typeof status.needsSetup !== "boolean") {
    throw new Error("Setup status probe returned an unexpected shape");
  }
  return status;
}

/**
 * Fail-closed like the setup probe: a transport blip must surface the retry
 * UI, not silently masquerade as logged-out and bounce to /login.
 */
async function getSessionUser() {
  try {
    const { data } = await authClient.getSession({
      fetchOptions: { credentials: "include" },
    });
    return data?.user ?? null;
  } catch (e) {
    throw new Error(
      `Session probe failed: ${e instanceof Error ? e.message : "network error"}`,
      { cause: e }
    );
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

type GateKind = "login" | "setup" | "app";

/**
 * The redirect matrix each route guard encodes: given the gate probe, the
 * target the route must bounce to, or `null` to stay. One table instead of
 * three hand-rolled `if` ladders.
 */
function gateRedirect(
  kind: GateKind,
  gate: { needsSetup: boolean; user: unknown },
): "/setup" | "/login" | "/" | null {
  if (kind === "login") {
    if (gate.needsSetup) return "/setup";
    if (gate.user) return "/";
    return null;
  }
  if (kind === "setup") {
    if (gate.needsSetup) return null;
    return gate.user ? "/" : "/login";
  }
  if (gate.needsSetup) return "/setup";
  if (!gate.user) return "/login";
  return null;
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
    const target = gateRedirect("login", await loadGate());
    if (target) throw redirect({ to: target });
  },
  component: LoginPage,
});

const setupRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/setup",
  beforeLoad: async () => {
    const target = gateRedirect("setup", await loadGate());
    if (target) throw redirect({ to: target });
  },
  component: SetupPage,
});

const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "app",
  beforeLoad: async () => {
    const target = gateRedirect("app", await loadGate());
    if (target) throw redirect({ to: target });
  },
  // The SSE stream sits behind the session guard: the provider mounts here,
  // not at the SPA root — `/login` and `/setup` open zero EventSource
  // traffic. (Svelte connected from the authenticated layout; same rule.)
  component: () => (
    <ActivityProvider>
      <Layout>
        <Outlet />
      </Layout>
    </ActivityProvider>
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
  component: StackDetailRouteComponent,
});

/**
 * One-line wrapper: reads params/search from the route and passes them as
 * plain props, so the page module never imports this router module back
 * (no module cycle — the dependency stays router → page).
 */
function StackDetailRouteComponent() {
  const { name } = stackDetailRoute.useParams();
  const { tab } = stackDetailRoute.useSearch();
  const navigate = stackDetailRoute.useNavigate();
  const activeTab: StackTab = tab ?? "services";
  return (
    <StackDetailPage
      name={name}
      tab={activeTab}
      onTabChange={(next) => navigate({ search: { tab: next } })}
    />
  );
}

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
