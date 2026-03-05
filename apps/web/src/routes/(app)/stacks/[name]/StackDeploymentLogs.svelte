<script lang="ts">
  import { StatusBadge } from "$lib/components";

  type LogEntry = {
    id: string;
    status: string;
    action: string;
    output: string | null;
    createdAt: Date | string | null;
  };

  type Props = {
    logs: LogEntry[];
  };

  let { logs }: Props = $props();
</script>

<div class="space-y-2">
  {#if logs.length === 0}
    <p class="text-text-muted text-sm">No deployment history</p>
  {:else}
    {#each logs as log (log.id)}
      <div class="bg-surface-2 border-border rounded-lg border px-4 py-3">
        <div class="flex items-center gap-3 text-sm">
          <StatusBadge status={log.status} />
          <span class="text-text-secondary font-mono">{log.action}</span>
          <span class="text-text-muted ml-auto text-xs">
            {log.createdAt ? new Date(log.createdAt).toLocaleString() : ""}
          </span>
        </div>
        {#if log.output}
          <pre
            class="text-text-muted bg-surface-0 mt-2 max-h-32 overflow-auto rounded p-2 font-mono text-xs">{log.output}</pre>
        {/if}
      </div>
    {/each}
  {/if}
</div>
