import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useForm } from "@tanstack/react-form";
import { AuthLayout, Button } from "@laber/ui";
import { signUp } from "@/lib/auth";

export default function SetupPage() {
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const form = useForm({
    defaultValues: { name: "", email: "", password: "" },
    onSubmit: async ({ value }) => {
      setLoading(true);
      setError("");
      const { error: authError } = await signUp.email({
        name: value.name,
        email: value.email,
        password: value.password,
        callbackURL: "/",
      });
      if (authError) {
        setError(authError.message ?? "Registration failed");
        setLoading(false);
        return;
      }
      navigate({ to: "/" });
    },
  });

  return (
    <AuthLayout title="laber" subtitle="Create your admin account">
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
                minLength={8}
                placeholder="Choose a password (min. 8 characters)"
                className="w-full"
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
              />
            )}
          </form.Field>
        </div>

        <Button
          variant="primary"
          type="submit"
          disabled={loading}
          className="w-full py-2.5"
        >
          {loading ? "Creating account..." : "Create Account"}
        </Button>
      </form>
    </AuthLayout>
  );
}
