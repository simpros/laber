import { useState } from "react";
import { useForm } from "@tanstack/react-form";
import { AuthLayout, Button } from "@laber/ui";
import { submitCredentials } from "@/lib/auth";

const COPY = {
  login: {
    title: "laber",
    subtitle: "Homelab Stack Manager",
    submit: "Sign In",
    submitting: "Signing in...",
  },
  setup: {
    title: "laber",
    subtitle: "Create your admin account",
    submit: "Create Account",
    submitting: "Creating account...",
  },
} as const;

/**
 * The one credentials form for login and setup. Submit state is react-form's
 * own `isSubmitting` (no parallel register); `onSuccess` is awaited so gate
 * failures surface here instead of being swallowed.
 */
export default function AuthCredentialsForm({
  mode,
  onSuccess,
}: {
  mode: "login" | "setup";
  onSuccess: () => void | Promise<void>;
}) {
  const copy = COPY[mode];
  const [error, setError] = useState("");

  const form = useForm({
    defaultValues: { name: "", email: "", password: "" },
    onSubmit: async ({ value }) => {
      setError("");
      const message = await submitCredentials(mode, value);
      if (message) {
        setError(message);
        return;
      }
      try {
        await onSuccess();
      } catch {
        setError("Signed in, but entering the app failed. Please retry.");
      }
    },
  });

  return (
    <AuthLayout title={copy.title} subtitle={copy.subtitle}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          form.handleSubmit();
        }}
        className="bg-surface-2 border-border space-y-4 rounded-xl border p-6"
      >
        {error && (
          <div className="bg-danger/10 text-danger rounded-lg px-3 py-2 text-sm">
            {error}
          </div>
        )}

        {mode === "setup" && (
          <div className="space-y-1.5">
            <label
              htmlFor="name"
              className="text-text-secondary text-sm font-medium"
            >
              Name
            </label>
            <form.Field name="name">
              {(field) => (
                <input
                  id="name"
                  type="text"
                  required
                  placeholder="Admin"
                  className="w-full"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                />
              )}
            </form.Field>
          </div>
        )}

        <div className="space-y-1.5">
          <label
            htmlFor="email"
            className="text-text-secondary text-sm font-medium"
          >
            Email
          </label>
          <form.Field name="email">
            {(field) => (
              <input
                id="email"
                type="email"
                required
                placeholder="admin@homelab.local"
                className="w-full"
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
              />
            )}
          </form.Field>
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="password"
            className="text-text-secondary text-sm font-medium"
          >
            Password
          </label>
          <form.Field name="password">
            {(field) => (
              <input
                id="password"
                type="password"
                required
                minLength={mode === "setup" ? 8 : undefined}
                placeholder={
                  mode === "setup"
                    ? "Choose a password (min. 8 characters)"
                    : "Enter your password"
                }
                className="w-full"
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
              />
            )}
          </form.Field>
        </div>

        <form.Subscribe selector={(s) => s.isSubmitting}>
          {(isSubmitting) => (
            <Button
              variant="primary"
              type="submit"
              disabled={isSubmitting}
              className="w-full py-2.5"
            >
              {isSubmitting ? copy.submitting : copy.submit}
            </Button>
          )}
        </form.Subscribe>
      </form>
    </AuthLayout>
  );
}
