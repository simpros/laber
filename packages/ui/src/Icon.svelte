<script lang="ts">
  import type { Snippet } from "svelte";

  type Props = {
    size?: "sm" | "md" | "lg";
    class?: string;
    children: Snippet;
  };

  let { size = "md", children, ...rest }: Props = $props();

  const sizes = {
    sm: "h-3.5 w-3.5",
    md: "h-4 w-4",
    lg: "h-5 w-5",
  };
</script>

<svg
  class="{sizes[size]} shrink-0 {rest.class ?? ''}"
  viewBox="0 0 16 16"
  fill="none"
  stroke="currentColor"
  stroke-width="1.5"
>
  {@render children()}
</svg>
