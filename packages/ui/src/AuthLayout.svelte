<script lang="ts">
  import type { Snippet } from "svelte";

  type Props = {
    title: string;
    subtitle: string;
    children: Snippet;
  };

  let { title, subtitle, children }: Props = $props();
</script>

<div class="flex min-h-dvh items-center justify-center p-4">
  <div class="w-full max-w-sm">
    <div class="mb-8 text-center">
      <h1 class="font-mono text-2xl font-bold tracking-tight">
        {title}
      </h1>
      <p class="text-text-secondary mt-1 text-sm">
        {subtitle}
      </p>
    </div>

    {@render children()}
  </div>
</div>
