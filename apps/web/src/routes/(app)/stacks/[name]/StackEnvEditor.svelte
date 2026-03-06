<script lang="ts">
  import { Button, Icon } from "@laber/ui";
  import { saveStackEnv } from "./data.remote";
  import { untrack } from "svelte";

  type EnvEntry = {
    key: string;
    value: string;
    isSecret: boolean;
  };

  type Props = {
    envVars: EnvEntry[];
    stackName: string;
    detectedEnvVars?: string[];
  };

  let {
    envVars: initialEnvVars,
    stackName,
    detectedEnvVars = [],
  }: Props = $props();
  let envEntries = $state(
    untrack(() => initialEnvVars).map((v) => ({
      key: v.key,
      value: v.value,
      isSecret: v.isSecret,
    }))
  );
  let saving = $state(false);

  let missingVars = $derived(
    detectedEnvVars.filter(
      (name) => !envEntries.some((e) => e.key === name)
    )
  );

  function addEnvVar() {
    envEntries.push({
      key: "",
      value: "",
      isSecret: false,
    });
  }

  function addDetectedVar(name: string) {
    envEntries.push({
      key: name,
      value: "",
      isSecret: false,
    });
  }

  function addAllMissing() {
    for (const name of missingVars) {
      envEntries.push({ key: name, value: "", isSecret: false });
    }
  }

  function removeEnvVar(index: number) {
    envEntries.splice(index, 1);
  }

  async function handleSave() {
    saving = true;
    try {
      await saveStackEnv({ name: stackName, entries: envEntries });
    } finally {
      saving = false;
    }
  }
</script>

<div class="space-y-2">
  {#each envEntries as entry, i (i)}
    {@const isDetected = detectedEnvVars.includes(entry.key)}
    <div class="flex items-center gap-2">
      <input
        bind:value={entry.key}
        placeholder="KEY"
        class="w-48 font-mono text-xs"
      />
      <input
        bind:value={entry.value}
        placeholder="value"
        type={entry.isSecret ? "password" : "text"}
        class="flex-1 font-mono text-xs"
      />
      {#if isDetected}
        <span
          class="bg-accent/15 text-accent rounded px-1.5 py-0.5 text-[10px] font-medium"
        >
          detected
        </span>
      {/if}
      <label
        class="text-text-muted flex items-center gap-1 text-xs"
        title="Masks the value in the UI and hides it from API responses. The actual value is still stored and passed to Docker on deploy."
      >
        <input
          type="checkbox"
          bind:checked={entry.isSecret}
          class="rounded"
        />
        Secret
      </label>
      <button
        type="button"
        onclick={() => removeEnvVar(i)}
        class="text-text-muted hover:text-danger p-1 transition-colors"
        aria-label="Remove variable"
      >
        <Icon>
          <path d="M4 4l8 8M12 4l-8 8" />
        </Icon>
      </button>
    </div>
  {/each}
</div>

<div class="mt-4 flex gap-2">
  <Button variant="secondary" size="sm" type="button" onclick={addEnvVar}>
    Add Variable
  </Button>
  <Button
    variant="primary"
    size="sm"
    type="button"
    disabled={saving}
    onclick={handleSave}
  >
    {saving ? "Saving..." : "Save"}
  </Button>
</div>

{#if detectedEnvVars.length > 0}
  <div
    class="bg-surface-1 border-border fixed right-0 bottom-0 left-60 z-10 border-t px-6 py-3"
  >
    <div class="flex items-center gap-3">
      <span
        class="text-text-secondary shrink-0 text-xs font-medium tracking-wider uppercase"
      >
        Detected
      </span>
      <div class="flex flex-wrap items-center gap-1.5">
        {#each detectedEnvVars as name (name)}
          {@const isMissing = missingVars.includes(name)}
          {#if isMissing}
            <button
              type="button"
              onclick={() => addDetectedVar(name)}
              class="border-warning/40 text-warning hover:bg-warning/10 rounded border px-2 py-0.5 font-mono text-xs transition-colors"
            >
              + {name}
            </button>
          {:else}
            <span
              class="text-success/60 bg-surface-3 rounded px-2 py-0.5 font-mono text-xs"
            >
              {name}
            </span>
          {/if}
        {/each}
      </div>
      {#if missingVars.length > 0}
        <div class="ml-auto shrink-0">
          <Button variant="secondary" size="sm" onclick={addAllMissing}>
            Add All Missing
          </Button>
        </div>
      {/if}
    </div>
  </div>
{/if}
