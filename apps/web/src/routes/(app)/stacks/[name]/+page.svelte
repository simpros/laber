<script lang="ts">
  import { enhance } from "$app/forms";
  import { resolve } from "$app/paths";

  let { data, form } = $props();
  let activeTab = $state<"services" | "env" | "logs">("services");
  let envEntries = $state(
    data.envVars.map((v) => ({ key: v.key, value: v.value, isSecret: v.isSecret })),
  );
  let actionLoading = $state("");

  function addEnvVar() {
    envEntries.push({ key: "", value: "", isSecret: false });
  }

  function removeEnvVar(index: number) {
    envEntries.splice(index, 1);
  }

  function statusColor(state: string) {
    if (state === "running") return "text-success";
    if (state === "exited" || state === "stopped") return "text-warning";
    return "text-danger";
  }

  function containerStatusBg(state: string) {
    if (state === "running") return "bg-success/10 border-success/20";
    if (state === "exited") return "bg-warning/10 border-warning/20";
    return "bg-danger/10 border-danger/20";
  }

  const tabs = [
    { id: "services" as const, label: "Services" },
    { id: "env" as const, label: "Environment" },
    { id: "logs" as const, label: "Deployments" },
  ];
</script>

<svelte:head>
  <title>{data.stack.name} - Laber</title>
</svelte:head>

<div class="space-y-6">
  <div class="flex items-center justify-between">
    <div>
      <div class="flex items-center gap-3">
        <a
          href={resolve("/stacks")}
          class="text-text-muted hover:text-text-secondary text-sm"
        >
          Stacks
        </a>
        <span class="text-text-muted text-sm">/</span>
        <h1 class="font-mono text-2xl font-semibold">{data.stack.name}</h1>
      </div>
      <p class="text-text-muted mt-1 text-xs font-mono">
        {data.stack.relativePath}/{data.stack.composeFile}
      </p>
    </div>

    <div class="flex items-center gap-2">
      <form method="POST" action="?/pull" use:enhance={() => {
        actionLoading = "pull";
        return async ({ update }) => { actionLoading = ""; await update(); };
      }}>
        <button
          type="submit"
          disabled={actionLoading !== ""}
          class="border-border hover:bg-surface-3 rounded-lg border px-3 py-1.5 text-sm transition-colors disabled:opacity-50"
        >
          {actionLoading === "pull" ? "Pulling..." : "Pull"}
        </button>
      </form>

      {#if data.stack.status === "deployed"}
        <form method="POST" action="?/restart" use:enhance={() => {
          actionLoading = "restart";
          return async ({ update }) => { actionLoading = ""; await update(); };
        }}>
          <button
            type="submit"
            disabled={actionLoading !== ""}
            class="border-border hover:bg-surface-3 rounded-lg border px-3 py-1.5 text-sm transition-colors disabled:opacity-50"
          >
            {actionLoading === "restart" ? "Restarting..." : "Restart"}
          </button>
        </form>
        <form method="POST" action="?/stop" use:enhance={() => {
          actionLoading = "stop";
          return async ({ update }) => { actionLoading = ""; await update(); };
        }}>
          <button
            type="submit"
            disabled={actionLoading !== ""}
            class="bg-danger/10 text-danger hover:bg-danger/20 rounded-lg px-3 py-1.5 text-sm transition-colors disabled:opacity-50"
          >
            {actionLoading === "stop" ? "Stopping..." : "Stop"}
          </button>
        </form>
      {:else}
        <form method="POST" action="?/deploy" use:enhance={() => {
          actionLoading = "deploy";
          return async ({ update }) => { actionLoading = ""; await update(); };
        }}>
          <button
            type="submit"
            disabled={actionLoading !== ""}
            class="bg-accent hover:bg-accent-hover rounded-lg px-3 py-1.5 text-sm font-medium text-white transition-colors disabled:opacity-50"
          >
            {actionLoading === "deploy" ? "Deploying..." : "Deploy"}
          </button>
        </form>
      {/if}
    </div>
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

  <div class="border-border flex gap-0 border-b">
    {#each tabs as tab (tab.id)}
      <button
        onclick={() => (activeTab = tab.id)}
        class="border-b-2 px-4 py-2 text-sm font-medium transition-colors {activeTab ===
        tab.id
          ? 'border-accent text-text-primary'
          : 'border-transparent text-text-muted hover:text-text-secondary'}"
      >
        {tab.label}
      </button>
    {/each}
  </div>

  {#if activeTab === "services"}
    <div class="space-y-3">
      {#if data.containers.length > 0}
        <h3 class="text-text-secondary text-xs font-medium uppercase tracking-wider">
          Running Containers
        </h3>
        {#each data.containers as container (container.name)}
          <div
            class="rounded-xl border p-4 {containerStatusBg(container.state)}"
          >
            <div class="flex items-center justify-between">
              <div>
                <p class="font-mono text-sm font-medium">{container.name}</p>
                <p class="text-text-muted mt-0.5 font-mono text-xs">
                  {container.image}
                </p>
              </div>
              <span class="text-xs font-medium {statusColor(container.state)}">
                {container.status}
              </span>
            </div>
            {#if container.ports.length > 0}
              <div class="mt-2 flex flex-wrap gap-1.5">
                {#each container.ports as port, i (i)}
                  <span
                    class="bg-surface-0/50 rounded px-1.5 py-0.5 font-mono text-xs"
                  >
                    {port.host}:{port.container}
                  </span>
                {/each}
              </div>
            {/if}
          </div>
        {/each}
      {:else if data.services.length > 0}
        <h3 class="text-text-secondary text-xs font-medium uppercase tracking-wider">
          Defined Services
        </h3>
        {#each data.services as svc (svc.name)}
          <div class="bg-surface-2 border-border rounded-xl border p-4">
            <div class="flex items-center justify-between">
              <p class="font-mono text-sm font-medium">{svc.name}</p>
              <span class="text-text-muted font-mono text-xs">{svc.image}</span>
            </div>
            {#if svc.traefikRoute}
              <p class="text-accent mt-1 font-mono text-xs">
                {svc.traefikRoute.subdomain}.* :{svc.traefikRoute.port}
              </p>
            {/if}
          </div>
        {/each}
      {:else}
        <p class="text-text-muted text-sm">No service data available</p>
      {/if}
    </div>
  {:else if activeTab === "env"}
    <form
      method="POST"
      action="?/saveEnv"
      use:enhance={({ formData }) => {
        formData.set("env", JSON.stringify(envEntries));
        return async ({ update }) => await update();
      }}
    >
      <div class="space-y-2">
        {#each envEntries as entry, i (i)}
          <div class="flex items-center gap-2">
            <input
              bind:value={entry.key}
              placeholder="KEY"
              class="w-48 font-mono text-xs"
            />
            <input
              bind:value={entry.value}
              placeholder="value"
              type={entry.isSecret ? "password" : "text"}
              class="flex-1 font-mono text-xs"
            />
            <label class="text-text-muted flex items-center gap-1 text-xs">
              <input
                type="checkbox"
                bind:checked={entry.isSecret}
                class="rounded"
              />
              Secret
            </label>
            <button
              type="button"
              onclick={() => removeEnvVar(i)}
              class="text-text-muted hover:text-danger p-1 transition-colors"
              aria-label="Remove variable"
            >
              <svg class="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M4 4l8 8M12 4l-8 8" />
              </svg>
            </button>
          </div>
        {/each}
      </div>

      <div class="mt-4 flex gap-2">
        <button
          type="button"
          onclick={addEnvVar}
          class="border-border hover:bg-surface-3 rounded-lg border px-3 py-1.5 text-sm transition-colors"
        >
          Add Variable
        </button>
        <button
          type="submit"
          class="bg-accent hover:bg-accent-hover rounded-lg px-3 py-1.5 text-sm font-medium text-white transition-colors"
        >
          Save
        </button>
      </div>
    </form>
  {:else}
    <div class="space-y-2">
      {#if data.logs.length === 0}
        <p class="text-text-muted text-sm">No deployment history</p>
      {:else}
        {#each data.logs as log (log.id)}
          <div class="bg-surface-2 border-border rounded-lg border px-4 py-3">
            <div class="flex items-center gap-3 text-sm">
              <span
                class="rounded px-1.5 py-0.5 text-xs font-medium {log.status === 'success'
                  ? 'bg-success/10 text-success'
                  : log.status === 'error'
                    ? 'bg-danger/10 text-danger'
                    : 'bg-warning/10 text-warning'}"
              >
                {log.status}
              </span>
              <span class="text-text-secondary font-mono">{log.action}</span>
              <span class="text-text-muted ml-auto text-xs">
                {log.createdAt
                  ? new Date(log.createdAt).toLocaleString()
                  : ""}
              </span>
            </div>
            {#if log.output}
              <pre
                class="text-text-muted mt-2 max-h-32 overflow-auto rounded bg-surface-0 p-2 font-mono text-xs"
              >{log.output}</pre>
            {/if}
          </div>
        {/each}
      {/if}
    </div>
  {/if}
</div>
