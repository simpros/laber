<script lang="ts">
  import { logStatusColor } from "$lib/utils";

  type Props = {
    status: string;
    class?: string;
  };

  let { status, ...rest }: Props = $props();
</script>

<span
  class="rounded px-1.5 py-0.5 text-xs font-medium {logStatusColor(
    status
  )} {rest.class ?? ''}"
>
  {status}
</span>
