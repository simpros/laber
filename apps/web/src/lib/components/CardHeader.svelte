<script lang="ts">
  import type { Snippet } from "svelte";

  type Props = {
    title: string;
    actions?: Snippet;
  };

  let { title, actions }: Props = $props();
</script>

<div class="border-border border-b px-5 py-3">
  <div class="flex items-center justify-between">
    <h2 class="text-sm font-medium">{title}</h2>
    {#if actions}
      <div class="flex gap-2">
        {@render actions()}
      </div>
    {/if}
  </div>
</div>
