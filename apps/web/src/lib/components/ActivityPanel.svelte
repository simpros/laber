<script lang="ts">
  import { onMount, tick } from "svelte";
  import { Icon } from "@laber/ui";
  import { activityStore } from "$lib/activity.svelte";

  let panelBody: HTMLDivElement | undefined = $state();

  onMount(() => {
    activityStore.connect();
    return () => activityStore.disconnect();
  });

  $effect(() => {
    const first = activityStore.activities[0];
    if (first?.status === "running" && first.output) {
      void tick().then(() => {
        const el = panelBody?.querySelector<HTMLPreElement>("[data-active-output]");
        if (el) el.scrollTop = el.scrollHeight;
      });
    }
  });

  function elapsed(startedAt: number, finishedAt?: number) {
    const ms = (finishedAt ?? Date.now()) - startedAt;
    const secs = Math.round(ms / 1000);
    if (secs < 60) return `${secs}s`;
    return `${Math.floor(secs / 60)}m ${secs % 60}s`;
  }
</script>

{#if activityStore.open}
  <button
    class="fixed inset-0 z-40 bg-black/30 transition-opacity"
    onclick={() => (activityStore.open = false)}
    aria-label="Close activity panel"
  ></button>
{/if}

<div
  class="bg-surface-1 border-border fixed top-0 right-0 z-50 flex h-dvh w-[420px] max-w-[90vw] flex-col border-l shadow-2xl transition-transform duration-200 ease-out {activityStore.open
    ? 'translate-x-0'
    : 'translate-x-full'}"
>
  <div class="border-border flex items-center justify-between border-b px-4 py-3">
    <div class="flex items-center gap-2">
      <Icon class="opacity-60">
        <path d="M8 1.5v5l3 1.5" />
        <circle cx="8" cy="8" r="6.5" />
      </Icon>
      <span class="text-sm font-semibold">Activity</span>
      {#if activityStore.hasRunning}
        <span class="bg-accent/15 text-accent rounded px-1.5 py-0.5 text-[10px] font-medium">
          {activityStore.runningCount} running
        </span>
      {/if}
    </div>
    <div class="flex items-center gap-1">
      {#if activityStore.activities.length > 0 && !activityStore.hasRunning}
        <button
          onclick={() => activityStore.clear()}
          class="text-text-muted hover:text-text-secondary rounded-md p-1.5 text-xs transition-colors"
          title="Clear completed"
        >
          Clear
        </button>
      {/if}
      <button
        onclick={() => (activityStore.open = false)}
        class="text-text-muted hover:text-text-primary rounded-md p-1.5 transition-colors"
        title="Close panel"
      >
        <Icon>
          <path d="M4 4l8 8M12 4l-8 8" />
        </Icon>
      </button>
    </div>
  </div>

  <div class="flex-1 overflow-y-auto" bind:this={panelBody}>
    {#if activityStore.activities.length === 0}
      <div class="flex h-full items-center justify-center">
        <p class="text-text-muted text-sm">No recent activity</p>
      </div>
    {:else}
      <div class="divide-border divide-y">
        {#each activityStore.activities as activity (activity.id)}
          <div class="px-4 py-3">
            <div class="flex items-start justify-between gap-2">
              <div class="flex items-center gap-2 min-w-0">
                {#if activity.status === "running"}
                  <span class="bg-accent relative mt-0.5 h-2 w-2 shrink-0 rounded-full">
                    <span class="bg-accent absolute inset-0 animate-ping rounded-full opacity-75"></span>
                  </span>
                {:else if activity.status === "success"}
                  <Icon size="sm" class="text-success shrink-0">
                    <path d="M3.5 8.5l3 3 6-7" />
                  </Icon>
                {:else}
                  <Icon size="sm" class="text-danger shrink-0">
                    <circle cx="8" cy="8" r="5.5" />
                    <path d="M8 5.5v3M8 10.5v.5" />
                  </Icon>
                {/if}
                <span class="truncate font-mono text-xs font-medium">
                  {activity.title}
                </span>
              </div>
              <span class="text-text-muted shrink-0 text-[10px] tabular-nums">
                {elapsed(activity.startedAt, activity.finishedAt)}
              </span>
            </div>
            {#if activity.output}
              <pre
                data-active-output={activity.status === "running" ? "" : undefined}
                class="bg-surface-0 border-border mt-2 max-h-48 overflow-y-auto rounded-lg border p-3 font-mono text-[11px] leading-relaxed text-text-secondary whitespace-pre-wrap break-all"
              >{activity.output.trimEnd()}</pre>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>
