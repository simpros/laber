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

export async function enterApp(router: {
  invalidate: () => Promise<unknown>;
  navigate: (opts: { to: string }) => Promise<unknown> | unknown;
}): Promise<void> {
  await router.invalidate();
  await router.navigate({ to: "/" });
}

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
