<script lang="ts">
  import { enhance } from "$app/forms";

  let { data, form } = $props();
  let actionLoading = $state("");

  function statusColor(state: string) {
    if (state === "running") return "text-success";
    if (state === "exited" || state === "stopped") return "text-warning";
    return "text-danger";
  }
</script>

<svelte:head>
  <title>Core Services - Laber</title>
</svelte:head>

<div class="space-y-8">
  <div>
    <h1 class="text-2xl font-semibold">Core Services</h1>
    <p class="text-text-secondary mt-1 text-sm">
      Traefik reverse proxy, Cloudflare tunnel, and DNS companion
    </p>
  </div>

  {#if form?.output}
    <div
      class="rounded-xl border p-4 font-mono text-xs whitespace-pre-wrap {form?.success
        ? 'bg-success/5 border-success/20 text-success'
        : 'bg-danger/5 border-danger/20 text-danger'}"
    >
      {form.output}
    </div>
  {/if}

  {#if form?.message}
    <div class="bg-success/5 border-success/20 rounded-xl border p-4 text-sm text-success">
      {form.message}
    </div>
  {/if}

  {#if form?.error}
    <div class="bg-danger/5 border-danger/20 rounded-xl border p-4 text-sm text-danger">
      {form.error}
    </div>
  {/if}

  {#if data.coreServices.length > 0}
    <div class="bg-surface-2 border-border rounded-xl border">
      <div class="border-border border-b px-5 py-3">
        <div class="flex items-center justify-between">
          <h2 class="text-sm font-medium">Status</h2>
          <div class="flex gap-2">
            <form method="POST" action="?/restart" use:enhance={() => {
              actionLoading = "restart";
              return async ({ update }) => { actionLoading = ""; await update(); };
            }}>
              <button
                type="submit"
                disabled={actionLoading !== ""}
                class="border-border hover:bg-surface-3 rounded-lg border px-3 py-1.5 text-xs transition-colors disabled:opacity-50"
              >
                {actionLoading === "restart" ? "..." : "Restart"}
              </button>
            </form>
            <form method="POST" action="?/stop" use:enhance={() => {
              actionLoading = "stop";
              return async ({ update }) => { actionLoading = ""; await update(); };
            }}>
              <button
                type="submit"
                disabled={actionLoading !== ""}
                class="bg-danger/10 text-danger hover:bg-danger/20 rounded-lg px-3 py-1.5 text-xs transition-colors disabled:opacity-50"
              >
                {actionLoading === "stop" ? "..." : "Stop"}
              </button>
            </form>
          </div>
        </div>
      </div>
      <div class="divide-border divide-y">
        {#each data.coreServices as svc (svc.name)}
          <div class="flex items-center justify-between px-5 py-3">
            <div>
              <p class="font-mono text-sm">{svc.name}</p>
              <p class="text-text-muted font-mono text-xs">{svc.image}</p>
            </div>
            <span class="text-xs font-medium {statusColor(svc.state)}">
              {svc.state}
            </span>
          </div>
        {/each}
      </div>
    </div>
  {/if}

  <form
    method="POST"
    action="?/save"
    use:enhance={() => {
      return async ({ update }) => await update();
    }}
    class="bg-surface-2 border-border rounded-xl border"
  >
    <div class="border-border border-b px-5 py-3">
      <h2 class="text-sm font-medium">Configuration</h2>
    </div>
    <div class="space-y-4 p-5">
      {#each data.coreKeys as keyDef (keyDef.key)}
        <div class="grid grid-cols-3 items-center gap-4">
          <label
            for={keyDef.key}
            class="text-text-secondary text-sm font-medium"
          >
            {keyDef.label}
          </label>
          <div class="col-span-2">
            <input
              id={keyDef.key}
              name={keyDef.key}
              type={keyDef.secret ? "password" : "text"}
              value={data.config[keyDef.key]?.value ?? ""}
              placeholder={keyDef.placeholder}
              class="w-full font-mono text-sm"
            />
          </div>
        </div>
      {/each}
    </div>
    <div class="border-border flex items-center justify-end gap-2 border-t px-5 py-3">
      <button
        type="submit"
        class="border-border hover:bg-surface-3 rounded-lg border px-4 py-2 text-sm transition-colors"
      >
        Save Configuration
      </button>
    </div>
  </form>

  <div class="flex justify-end -mt-4">
    <form method="POST" action="?/deploy" use:enhance={() => {
      actionLoading = "deploy";
      return async ({ update }) => { actionLoading = ""; await update(); };
    }}>
      <button
        type="submit"
        disabled={actionLoading !== "" || !data.isConfigured}
        class="bg-accent hover:bg-accent-hover rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors disabled:opacity-50"
      >
        {actionLoading === "deploy" ? "Deploying..." : "Deploy Core Stack"}
      </button>
    </form>
  </div>
</div>
