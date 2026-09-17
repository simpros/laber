<script lang="ts">
  import type { Snippet } from "svelte";
  import type { HTMLButtonAttributes } from "svelte/elements";
  import type { ClassNameValue } from "tailwind-merge";
  import { cn } from "./cn.js";

  interface Props extends Omit<HTMLButtonAttributes, "class"> {
    children?: Snippet;
    class?: ClassNameValue;
  }

  let { class: className, children, ...rest }: Props = $props();
</script>

<button
  class={cn(
    "inline-flex h-9 items-center justify-center rounded-md bg-zinc-900 px-4 text-sm font-medium text-zinc-50 transition-colors hover:bg-zinc-700 disabled:pointer-events-none disabled:opacity-50",
    className
  )}
  {...rest}
>
  {@render children?.()}
</button>
