<script lang="ts">
  import { resolve } from "$app/paths";
  import { Card, CardHeader, StatusBadge } from "@laber/ui";
  import { statusColor, timeAgo } from "$lib/utils";
  import { getDashboard } from "./data.remote";

  const data = $derived(await getDashboard());
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
    <Card class="p-5">
      <p
        class="text-text-muted text-xs font-medium tracking-wider uppercase"
      >
        Total Stacks
      </p>
      <p class="mt-1 font-mono text-3xl font-bold">
        {data.stats.totalStacks}
      </p>
    </Card>
    <Card class="p-5">
      <p
        class="text-text-muted text-xs font-medium tracking-wider uppercase"
      >
        Deployed
      </p>
      <p class="text-success mt-1 font-mono text-3xl font-bold">
        {data.stats.deployedStacks}
      </p>
    </Card>
    <Card class="p-5">
      <p
        class="text-text-muted text-xs font-medium tracking-wider uppercase"
      >
        Repositories
      </p>
      <p class="mt-1 font-mono text-3xl font-bold">
        {data.stats.repositories}
      </p>
    </Card>
  </div>

  <div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
    <Card>
      <CardHeader title="Core Services" />
      <div class="p-5">
        {#if !data.coreConfigured}
          <div class="py-4 text-center">
            <p class="text-text-secondary text-sm">
              Core stack not configured
            </p>
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
    </Card>

    <Card>
      <CardHeader title="Recent Activity" />
      <div class="p-5">
        {#if data.recentLogs.length === 0}
          <p class="text-text-muted text-sm">No deployments yet</p>
        {:else}
          <div class="space-y-2">
            {#each data.recentLogs as log (log.id)}
              <div class="flex items-center gap-3 text-sm">
                <StatusBadge status={log.status} />
                <span class="text-text-secondary">
                  {log.isCore ? "core" : (log.stackId ?? "unknown")}
                </span>
                <span class="text-text-muted font-mono text-xs">
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
    </Card>
  </div>
</div>
