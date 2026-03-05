<script lang="ts">
  import { resolve } from "$app/paths";

  let { data } = $props();

  function statusColor(state: string) {
    if (state === "running") return "text-success";
    if (state === "exited" || state === "stopped") return "text-warning";
    return "text-danger";
  }

  function logStatusColor(status: string) {
    if (status === "success") return "bg-success/10 text-success";
    if (status === "error") return "bg-danger/10 text-danger";
    return "bg-warning/10 text-warning";
  }

  function timeAgo(date: Date | string) {
    const d = typeof date === "string" ? new Date(date) : date;
    const diff = Date.now() - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  }
</script>

<svelte:head>
  <title>Dashboard - Laber</title>
</svelte:head>

<div class="space-y-8">
  <div>
    <h1 class="text-2xl font-semibold">Dashboard</h1>
    <p class="text-text-secondary mt-1 text-sm">
      Overview of your homelab infrastructure
    </p>
  </div>

  <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
    <div class="bg-surface-2 border-border rounded-xl border p-5">
      <p class="text-text-muted text-xs font-medium uppercase tracking-wider">
        Total Stacks
      </p>
      <p class="font-mono text-3xl font-bold mt-1">{data.stats.totalStacks}</p>
    </div>
    <div class="bg-surface-2 border-border rounded-xl border p-5">
      <p class="text-text-muted text-xs font-medium uppercase tracking-wider">
        Deployed
      </p>
      <p class="font-mono text-3xl font-bold mt-1 text-success">
        {data.stats.deployedStacks}
      </p>
    </div>
    <div class="bg-surface-2 border-border rounded-xl border p-5">
      <p class="text-text-muted text-xs font-medium uppercase tracking-wider">
        Repositories
      </p>
      <p class="font-mono text-3xl font-bold mt-1">{data.stats.repositories}</p>
    </div>
  </div>

  <div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
    <div class="bg-surface-2 border-border rounded-xl border">
      <div class="border-border border-b px-5 py-3">
        <h2 class="text-sm font-medium">Core Services</h2>
      </div>
      <div class="p-5">
        {#if !data.coreConfigured}
          <div class="text-center py-4">
            <p class="text-text-secondary text-sm">Core stack not configured</p>
            <a
              href={resolve("/core")}
              class="text-accent hover:text-accent-hover mt-2 inline-block text-sm"
            >
              Configure now
            </a>
          </div>
        {:else if data.coreServices.length === 0}
          <p class="text-text-muted text-sm">No core containers running</p>
        {:else}
          <div class="space-y-2.5">
            {#each data.coreServices as svc (svc.name)}
              <div
                class="bg-surface-1 flex items-center justify-between rounded-lg px-3 py-2.5"
              >
                <span class="font-mono text-sm">{svc.name}</span>
                <span class="text-xs font-medium {statusColor(svc.state)}">
                  {svc.state}
                </span>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    </div>

    <div class="bg-surface-2 border-border rounded-xl border">
      <div class="border-border border-b px-5 py-3">
        <h2 class="text-sm font-medium">Recent Activity</h2>
      </div>
      <div class="p-5">
        {#if data.recentLogs.length === 0}
          <p class="text-text-muted text-sm">No deployments yet</p>
        {:else}
          <div class="space-y-2">
            {#each data.recentLogs as log (log.id)}
              <div class="flex items-center gap-3 text-sm">
                <span
                  class="rounded px-1.5 py-0.5 text-xs font-medium {logStatusColor(log.status)}"
                >
                  {log.status}
                </span>
                <span class="text-text-secondary">
                  {log.isCore ? "core" : log.stackId ?? "unknown"}
                </span>
                <span class="font-mono text-text-muted text-xs">
                  {log.action}
                </span>
                <span class="text-text-muted ml-auto text-xs">
                  {log.createdAt ? timeAgo(log.createdAt) : ""}
                </span>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    </div>
  </div>
</div>
