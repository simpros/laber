<script lang="ts">
  import type { Snippet } from "svelte";
  import type { HTMLButtonAttributes } from "svelte/elements";
  import type { ClassNameValue } from "tailwind-merge";
  import { tv, type VariantProps } from "tailwind-variants";
  import { cn } from "./cn.js";

  const button = tv({
    base: "inline-flex items-center justify-center rounded-md font-medium transition-colors disabled:opacity-50",
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground",
        outline: "border border-input bg-transparent",
        ghost: "bg-transparent",
      },
      size: {
        default: "h-9 px-4 text-sm",
        sm: "h-8 px-3 text-xs",
        lg: "h-10 px-6 text-base",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  });

  interface Props
    extends
      Omit<HTMLButtonAttributes, "class">,
      VariantProps<typeof button> {
    children?: Snippet;
    class?: ClassNameValue;
  }

  let {
    variant,
    size,
    class: className,
    children,
    ...rest
  }: Props = $props();
</script>

<button class={cn(button({ variant, size }), className)} {...rest}>
  {@render children?.()}
</button>
