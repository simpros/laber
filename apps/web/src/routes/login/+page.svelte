<script lang="ts">
  import { signIn } from "@laber/auth/client";

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

<div class="flex min-h-dvh items-center justify-center p-4">
  <div class="w-full max-w-sm">
    <div class="mb-8 text-center">
      <h1 class="font-mono text-2xl font-bold tracking-tight">laber</h1>
      <p class="text-text-secondary mt-1 text-sm">Homelab Stack Manager</p>
    </div>

    <form
      onsubmit={handleLogin}
      class="bg-surface-2 border-border space-y-4 rounded-xl border p-6"
    >
      {#if error}
        <div
          class="bg-danger/10 text-danger rounded-lg px-3 py-2 text-sm"
        >
          {error}
        </div>
      {/if}

      <div class="space-y-1.5">
        <label for="email" class="text-text-secondary text-sm font-medium"
          >Email</label
        >
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
        <label for="password" class="text-text-secondary text-sm font-medium"
          >Password</label
        >
        <input
          id="password"
          type="password"
          bind:value={password}
          required
          placeholder="••••••••"
          class="w-full"
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        class="bg-accent hover:bg-accent-hover w-full rounded-lg px-4 py-2.5 text-sm font-medium text-white transition-colors disabled:opacity-50"
      >
        {loading ? "Signing in..." : "Sign In"}
      </button>
    </form>
  </div>
</div>
