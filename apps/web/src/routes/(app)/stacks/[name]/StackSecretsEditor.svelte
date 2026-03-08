<script lang="ts">
  import { Button, Icon } from "@laber/ui";
  import { saveStackSecrets } from "./data.remote";
  import { untrack } from "svelte";

  type SecretEntry = {
    name: string;
    filePath: string;
    services: string[];
    hasValue: boolean;
  };

  type Props = {
    secrets: SecretEntry[];
    stackName: string;
  };

  let { secrets, stackName }: Props = $props();

  let entries = $state(
    untrack(() => secrets).map((s) => ({
      name: s.name,
      filePath: s.filePath,
      services: s.services,
      value: s.hasValue ? "••••••••" : "",
      hadValue: s.hasValue,
    }))
  );
  let saving = $state(false);

  let unsetCount = $derived(entries.filter((e) => e.value === "").length);

  async function handleSave() {
    saving = true;
    try {
      await saveStackSecrets({
        name: stackName,
        entries: entries.map((e) => ({ name: e.name, value: e.value })),
      });
    } finally {
      saving = false;
    }
  }
</script>

{#if entries.length === 0}
  <div class="text-text-muted py-8 text-center text-sm">
    No secrets defined in compose file.
  </div>
{:else}
  <div class="space-y-3">
    {#if unsetCount > 0}
      <div
        class="border-warning/30 bg-warning/5 flex items-center gap-2 rounded-lg border px-3 py-2"
      >
        <Icon class="text-warning shrink-0">
          <path
            d="M8 1a1 1 0 0 1 .867.5l6.928 12A1 1 0 0 1 14.928 15H1.072a1 1 0 0 1-.867-1.5l6.928-12A1 1 0 0 1 8 1ZM8 5a.75.75 0 0 0-.75.75v3.5a.75.75 0 0 0 1.5 0v-3.5A.75.75 0 0 0 8 5Zm0 8a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Z"
          />
        </Icon>
        <span class="text-warning text-xs">
          {unsetCount} secret{unsetCount > 1 ? "s" : ""} without a value — deploy
          will skip writing {unsetCount > 1 ? "them" : "it"}
        </span>
      </div>
    {/if}

    {#each entries as entry (entry.name)}
      <div class="bg-surface-2 border-border rounded-lg border p-3">
        <div class="mb-2 flex items-center gap-2">
          <Icon class="text-accent shrink-0">
            <path
              d="M8 1a4 4 0 0 0-4 4v2H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1h-1V5a4 4 0 0 0-4-4ZM6 5a2 2 0 1 1 4 0v2H6V5Zm2 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"
            />
          </Icon>
          <span class="font-mono text-sm font-medium">{entry.name}</span>
          {#if entry.value !== "" && entry.value !== "••••••••"}
            <span
              class="bg-success/15 text-success rounded px-1.5 py-0.5 text-[10px] font-medium"
            >
              modified
            </span>
          {:else if entry.hadValue}
            <span
              class="bg-success/15 text-success rounded px-1.5 py-0.5 text-[10px] font-medium"
            >
              set
            </span>
          {:else}
            <span
              class="bg-warning/15 text-warning rounded px-1.5 py-0.5 text-[10px] font-medium"
            >
              unset
            </span>
          {/if}
        </div>

        <div class="flex items-center gap-2">
          <input
            bind:value={entry.value}
            placeholder="Enter secret value…"
            type="password"
            class="flex-1 font-mono text-xs"
          />
          {#if entry.value !== "" && entry.value !== "••••••••"}
            <button
              type="button"
              onclick={() =>
                (entry.value = entry.hadValue ? "••••••••" : "")}
              class="text-text-muted hover:text-danger p-1 transition-colors"
              aria-label="Reset"
              title="Undo changes"
            >
              <Icon>
                <path
                  d="M2.5 2v4.5h4.5M2.87 8a5.5 5.5 0 1 0 1.01-3.25"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.5"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </Icon>
            </button>
          {/if}
        </div>

        <div
          class="text-text-muted mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]"
        >
          <span class="font-mono">{entry.filePath}</span>
          {#if entry.services.length > 0}
            <span>
              Used by {entry.services.join(", ")}
            </span>
          {/if}
        </div>
      </div>
    {/each}
  </div>

  <div class="mt-4">
    <Button
      variant="primary"
      size="sm"
      type="button"
      disabled={saving}
      onclick={handleSave}
    >
      {saving ? "Saving..." : "Save Secrets"}
    </Button>
  </div>
{/if}
