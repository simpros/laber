<script lang="ts">
  import { resolve } from "$app/paths";
  import { Card, Button, Icon } from "@laber/ui";
  import { statusBadge } from "$lib/utils";
  import { getStacks } from "./data.remote";

  const stacks = $derived(await getStacks());
</script>

<svelte:head>
  <title>Stacks - Laber</title>
</svelte:head>

<div class="space-y-6">
  <div class="flex items-center justify-between">
    <div>
      <h1 class="text-2xl font-semibold">Stacks</h1>
      <p class="text-text-secondary mt-1 text-sm">
        Manage your homelab service stacks
      </p>
    </div>
    {#if stacks.length === 0}
      <a href={resolve("/settings/repository")}>
        <Button variant="primary">Link Repository</Button>
      </a>
    {/if}
  </div>

  {#if stacks.length === 0}
    <Card class="px-6 py-12 text-center">
      <Icon size="lg" class="mx-auto h-12 w-12 opacity-20">
        <path d="M8 1.5L14.5 5.5L8 9.5L1.5 5.5Z" />
        <path d="M1.5 8L8 12L14.5 8" />
        <path d="M1.5 10.5L8 14.5L14.5 10.5" />
      </Icon>
      <p class="text-text-secondary mt-4 text-sm">
        No stacks discovered yet. Link a repository to get started.
      </p>
    </Card>
  {:else}
    <div class="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
      {#each stacks as stack (stack.name)}
        <a
          href={resolve(`/stacks/${stack.name}`)}
          class="bg-surface-2 border-border hover:border-border-hover group rounded-xl border p-5 transition-colors"
        >
          <div class="flex items-start justify-between">
            <div>
              <h3 class="font-mono text-sm font-semibold">{stack.name}</h3>
              <p class="text-text-muted mt-0.5 text-xs">
                {stack.relativePath}
              </p>
            </div>
            <span
              class="rounded-full px-2 py-0.5 text-xs font-medium {statusBadge(
                stack.status
              )}"
            >
              {stack.status}
            </span>
          </div>

          <div
            class="text-text-muted mt-4 flex items-center gap-3 text-xs"
          >
            {#if stack.networkName}
              <span class="font-mono">net:{stack.networkName}</span>
            {/if}
            <span>{stack.envVarCount} env vars</span>
            {#if stack.repoName}
              <span class="ml-auto truncate">{stack.repoName}</span>
            {/if}
          </div>
        </a>
      {/each}
    </div>
  {/if}
</div>
