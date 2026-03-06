<script lang="ts">
  import { Icon } from "@laber/ui";

  type Props = {
    content: string;
    fileName: string;
  };

  let { content, fileName }: Props = $props();
  let copied = $state(false);

  async function copyToClipboard() {
    await navigator.clipboard.writeText(content);
    copied = true;
    setTimeout(() => (copied = false), 2000);
  }
</script>

<div class="bg-surface-2 border-border overflow-hidden rounded-lg border">
  <div class="border-border flex items-center justify-between border-b px-4 py-2">
    <span class="text-text-secondary font-mono text-xs">{fileName}</span>
    <button
      type="button"
      onclick={copyToClipboard}
      class="text-text-muted hover:text-text-secondary flex items-center gap-1 text-xs transition-colors"
    >
      <Icon>
        {#if copied}
          <path d="M4 8l3 3 5-6" />
        {:else}
          <path d="M5 2H3a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V5M5 2h4l3 3v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z" />
        {/if}
      </Icon>
      {copied ? "Copied" : "Copy"}
    </button>
  </div>
  <pre class="overflow-auto p-4 font-mono text-xs leading-relaxed text-text-primary">{content}</pre>
</div>
