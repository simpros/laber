<script lang="ts">
  type Props = {
    status: string;
    class?: string;
  };

  let { status, ...rest }: Props = $props();

  function statusColorClass(s: string) {
    if (s === "success") return "bg-success/10 text-success";
    if (s === "error") return "bg-danger/10 text-danger";
    return "bg-warning/10 text-warning";
  }
</script>

<span
  class="rounded px-1.5 py-0.5 text-xs font-medium {statusColorClass(
    status
  )} {rest.class ?? ''}"
>
  {status}
</span>
