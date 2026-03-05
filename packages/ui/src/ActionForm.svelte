<script lang="ts">
  import type { Snippet } from "svelte";
  import type { Action } from "svelte/action";

  type Props = {
    action: string;
    onLoadingChange: (value: string) => void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    enhance: Action<HTMLFormElement, any>;
    children: Snippet;
  };

  let { action, onLoadingChange, enhance: enhanceAction, children }: Props = $props();

  const actionName = $derived(action.replace("?/", ""));
</script>

<form
  method="POST"
  {action}
  use:enhanceAction={() => {
    onLoadingChange(actionName);
    return async ({ update }: { update: () => Promise<void> }) => {
      onLoadingChange("");
      await update();
    };
  }}
>
  {@render children()}
</form>
