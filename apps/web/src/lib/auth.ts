export {
  authClient,
  signIn,
  signUp,
  signOut,
  useSession,
} from "@laber/auth/client";
import { signIn, signUp } from "@laber/auth/client";

export type CredentialValues = {
  name: string;
  email: string;
  password: string;
};

/**
 * The one place that wraps credential submits: normalizes better-auth's
 * `{ error }` union to an error string (`""` = ok) so the auth forms never
 * branch on the client shape themselves. No `callbackURL` — the SPA owns
 * routing through `enterApp`, so better-auth must not navigate on its own.
 */
export async function submitCredentials(
  mode: "login" | "setup",
  values: CredentialValues
): Promise<string> {
  const { error } =
    mode === "login"
      ? await signIn.email({
          email: values.email,
          password: values.password,
        })
      : await signUp.email({
          name: values.name,
          email: values.email,
          password: values.password,
        });
  if (!error) return "";
  return error.message ?? "Authentication failed";
}

/**
 * The one atomic handoff into the app shell: refresh the router gate
 * (session + setup probes) and only then navigate to `/`, so a cached
 * logged-out verdict can't bounce us back and no second navigation owner
 * races us.
 */
export async function enterApp(router: {
  invalidate: () => Promise<unknown>;
  navigate: (opts: { to: string }) => Promise<unknown> | unknown;
}): Promise<void> {
  await router.invalidate();
  await router.navigate({ to: "/" });
}

/**
 * The inverse of `enterApp`: clear the session's query cache, refresh the
 * gate, then leave for `/login` — so stale dashboard/stack data can never
 * survive into the next session and navigation has one owner. Call only
 * after the session is actually destroyed (`signOut`).
 */
export async function leaveApp(
  router: {
    invalidate: () => Promise<unknown>;
    navigate: (opts: { to: string }) => Promise<unknown> | unknown;
  },
  queryClient: { clear: () => void },
): Promise<void> {
  queryClient.clear();
  await router.invalidate();
  await router.navigate({ to: "/login" });
}
