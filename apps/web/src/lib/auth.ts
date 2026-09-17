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
 * branch on the client shape themselves.
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
          callbackURL: "/",
        })
      : await signUp.email({
          name: values.name,
          email: values.email,
          password: values.password,
          callbackURL: "/",
        });
  if (!error) return "";
  return error.message ?? "Authentication failed";
}
