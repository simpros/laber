<script lang="ts">
  import type { Snippet } from "svelte";
  import type { HTMLButtonAttributes } from "svelte/elements";

  type Props = HTMLButtonAttributes & {
    variant?: "primary" | "secondary" | "danger" | "ghost";
    size?: "sm" | "md";
    children: Snippet;
  };

  let {
    variant = "secondary",
    size = "md",
    children,
    class: className,
    ...rest
  }: Props = $props();

  const base =
    "rounded-lg font-medium transition-colors disabled:opacity-50 inline-flex items-center justify-center gap-1.5";

  const variants = {
    primary: "bg-accent hover:bg-accent-hover text-white",
    secondary: "border-border hover:bg-surface-3 border",
    danger: "bg-danger/10 text-danger hover:bg-danger/20",
    ghost: "text-text-secondary hover:text-text-primary",
  };

  const sizes = {
    sm: "px-3 py-1.5 text-xs",
    md: "px-4 py-2 text-sm",
  };
</script>

<button
  class="{base} {variants[variant]} {sizes[size]} {className ?? ''}"
  {...rest}
>
  {@render children()}
</button>
