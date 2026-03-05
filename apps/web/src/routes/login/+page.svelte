<script lang="ts">
  import { signIn } from "@laber/auth/client";
  import { AuthLayout, Button } from "$lib/components";

  let email = $state("");
  let password = $state("");
  let error = $state("");
  let loading = $state(false);

  async function handleLogin(e: SubmitEvent) {
    e.preventDefault();
    loading = true;
    error = "";

    const { error: authError } = await signIn.email({
      email,
      password,
      callbackURL: "/",
    });

    if (authError) {
      error = authError.message ?? "Login failed";
      loading = false;
    }
  }
</script>

<svelte:head>
  <title>Sign In - Laber</title>
</svelte:head>

<AuthLayout title="laber" subtitle="Homelab Stack Manager">
  <form
    onsubmit={handleLogin}
    class="bg-surface-2 border-border space-y-4 rounded-xl border p-6"
  >
    {#if error}
      <div class="bg-danger/10 text-danger rounded-lg px-3 py-2 text-sm">
        {error}
      </div>
    {/if}

    <div class="space-y-1.5">
      <label for="email" class="text-text-secondary text-sm font-medium">
        Email
      </label>
      <input
        id="email"
        type="email"
        bind:value={email}
        required
        placeholder="admin@homelab.local"
        class="w-full"
      />
    </div>

    <div class="space-y-1.5">
      <label
        for="password"
        class="text-text-secondary text-sm font-medium"
      >
        Password
      </label>
      <input
        id="password"
        type="password"
        bind:value={password}
        required
        placeholder="••••••••"
        class="w-full"
      />
    </div>

    <Button
      variant="primary"
      type="submit"
      disabled={loading}
      class="w-full py-2.5"
    >
      {loading ? "Signing in..." : "Sign In"}
    </Button>
  </form>
</AuthLayout>
