<script lang="ts">
  import { enhance } from "$app/forms";
  import { Button, Icon } from "$lib/components";

  type EnvEntry = {
    key: string;
    value: string;
    isSecret: boolean;
  };

  type Props = {
    envVars: EnvEntry[];
  };

  let { envVars: initialEnvVars }: Props = $props();
  let envEntries = $state(
    initialEnvVars.map((v) => ({
      key: v.key,
      value: v.value,
      isSecret: v.isSecret,
    }))
  );

  function addEnvVar() {
    envEntries.push({
      key: "",
      value: "",
      isSecret: false,
    });
  }

  function removeEnvVar(index: number) {
    envEntries.splice(index, 1);
  }
</script>

<form
  method="POST"
  action="?/saveEnv"
  use:enhance={({ formData }) => {
    formData.set("env", JSON.stringify(envEntries));
    return async ({ update }) => await update();
  }}
>
  <div class="space-y-2">
    {#each envEntries as entry, i (i)}
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
        <label class="text-text-muted flex items-center gap-1 text-xs">
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
    <Button
      variant="secondary"
      size="sm"
      type="button"
      onclick={addEnvVar}
    >
      Add Variable
    </Button>
    <Button variant="primary" size="sm" type="submit">Save</Button>
  </div>
</form>
