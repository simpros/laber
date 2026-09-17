<script lang="ts">
  import type { Snippet } from "svelte";

  type Props = {
    title: string;
    subtitle?: Snippet;
    actions?: Snippet;
  };

  let { title, subtitle, actions }: Props = $props();
</script>

<div class="border-border border-b px-5 py-3">
  <div class="flex items-center justify-between">
    <div class="flex items-center gap-2">
      <h2 class="text-sm font-medium">{title}</h2>
      {#if subtitle}
        {@render subtitle()}
      {/if}
    </div>
    {#if actions}
      <div class="flex gap-2">
        {@render actions()}
      </div>
    {/if}
  </div>
</div>
