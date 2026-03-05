<script lang="ts">
  import type { Snippet } from "svelte";
  import { enhance } from "$app/forms";

  type Props = {
    action: string;
    onLoadingChange: (value: string) => void;
    children: Snippet;
  };

  let { action, onLoadingChange, children }: Props = $props();

  const actionName = $derived(action.replace("?/", ""));
</script>

<form
  method="POST"
  {action}
  use:enhance={() => {
    onLoadingChange(actionName);
    return async ({ update }) => {
      onLoadingChange("");
      await update();
    };
  }}
>
  {@render children()}
</form>
