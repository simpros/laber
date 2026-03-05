<script lang="ts">
  import type { Snippet } from "svelte";

  type Props = {
    variant: "success" | "error" | "warning";
    mono?: boolean;
    class?: string;
    children: Snippet;
  };

  let { variant, mono = false, children, ...rest }: Props = $props();

  const styles = {
    success: "bg-success/5 border-success/20 text-success",
    error: "bg-danger/5 border-danger/20 text-danger",
    warning: "bg-warning/5 border-warning/20 text-warning",
  };
</script>

<div
  class="rounded-xl border p-4 text-sm {styles[variant]} {mono
    ? 'font-mono text-xs whitespace-pre-wrap'
    : ''} {rest.class ?? ''}"
>
  {@render children()}
</div>
