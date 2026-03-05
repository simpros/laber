<script lang="ts">
  import type { Snippet } from "svelte";

  type Props = {
    class?: string;
    children: Snippet;
  };

  let { children, ...rest }: Props = $props();
</script>

<div
  class="bg-surface-2 border-border rounded-xl border {rest.class ?? ''}"
>
  {@render children()}
</div>
