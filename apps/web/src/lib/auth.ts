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
 * The one credential-submit wrapper: normalizes better-auth's `{ error }`
 * union to a string (`""` = ok). Never navigates; the SPA owns routing.
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
 * Atomic handoff into the app shell: refresh the gate, then navigate, so a
 * cached logged-out verdict can't bounce us back.
 */
export async function enterApp(router: {
  invalidate: () => Promise<unknown>;
  navigate: (opts: { to: string }) => Promise<unknown> | unknown;
}): Promise<void> {
  await router.invalidate();
  await router.navigate({ to: "/" });
}

/**
 * Inverse of `enterApp`: clear the cache, refresh the gate, then leave, so
 * stale data can never survive into the next session. Call only after `signOut`.
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
