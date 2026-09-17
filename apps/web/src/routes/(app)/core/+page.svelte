<script lang="ts">
  import { Card, CardHeader, Button, Alert } from "@laber/ui";
  import { statusColor } from "$lib/utils";
  import {
    CORE_KEYS,
    CORE_KEY_GROUPS,
    type CoreKeyGroup,
  } from "$lib/core-keys";
  import {
    getCoreData,
    saveCoreConfig,
    deployCore,
    stopCore,
    restartCore,
  } from "./data.remote";
  import { untrack } from "svelte";

  const data = $derived(await getCoreData());

  const groups = Object.entries(CORE_KEY_GROUPS).map(([id, meta]) => ({
    id: id as CoreKeyGroup,
    ...meta,
    keys: CORE_KEYS.filter((k) => k.group === id),
  }));

  let actionLoading = $state("");
  let result = $state<{
    success?: boolean;
    output?: string;
    message?: string;
  } | null>(null);

  type FieldState = {
    key: string;
    secret: boolean;
    hadValue: boolean;
    value: string;
    dirty: boolean;
  };
  let fields = $state<FieldState[]>([]);
  let fieldsInitFor = $state<string>("");

  function syncFields() {
    const fingerprint = JSON.stringify(data.config);
    if (fingerprint === fieldsInitFor) return;
    fieldsInitFor = fingerprint;
    fields = untrack(() =>
      CORE_KEYS.map((keyDef) => {
        const stored = data.config[keyDef.key];
        return {
          key: keyDef.key,
          secret: keyDef.secret,
          hadValue: stored?.hasValue ?? false,
          value: keyDef.secret ? "" : (stored?.value ?? ""),
          dirty: false,
        };
      })
    );
  }
  $effect(syncFields);

  function fieldFor(key: string): FieldState | undefined {
    return fields.find((f) => f.key === key);
  }

  async function handleAction(
    action: () => Promise<{ success: boolean; output: string }>,
    name: string
  ) {
    actionLoading = name;
    result = null;
    try {
      result = await action();
    } catch (e) {
      result = {
        success: false,
        output: e instanceof Error ? e.message : "Unknown error",
      };
    } finally {
      actionLoading = "";
    }
  }

  async function handleSave(e: SubmitEvent) {
    e.preventDefault();
    // Secrets: null = leave unchanged, "" = clear, string = set.
    // Non-secrets always submit their current input value.
    const values: Record<string, string | null> = {};
    for (const f of fields) {
      values[f.key] = f.secret && !f.dirty ? null : f.value;
    }
    result = null;
    try {
      result = await saveCoreConfig(values);
    } catch (e) {
      result = {
        success: false,
        output: e instanceof Error ? e.message : "Unknown error",
      };
    }
  }

  function clearSecret(key: string) {
    const f = fieldFor(key);
    if (f) {
      f.value = "";
      f.dirty = true;
    }
  }

  function undoField(key: string) {
    const f = fieldFor(key);
    if (f) {
      f.value = f.secret ? "" : (data.config[key]?.value ?? "");
      f.dirty = false;
    }
  }
</script>

<svelte:head>
  <title>Core Services - Laber</title>
</svelte:head>

<div class="space-y-8">
  <div>
    <h1 class="text-2xl font-semibold">Core Services</h1>
    <p class="text-text-secondary mt-1 text-sm">
      Traefik reverse proxy with optional Cloudflare tunnel and DNS
      companion
    </p>
  </div>

  {#if result?.output}
    <Alert variant={result?.success ? "success" : "error"} mono>
      {result.output}
    </Alert>
  {/if}

  {#if result?.message}
    <Alert variant="success">{result.message}</Alert>
  {/if}

  {#snippet statusActions()}
    <Button
      variant="secondary"
      size="sm"
      disabled={actionLoading !== ""}
      onclick={() => handleAction(restartCore, "restart")}
    >
      {actionLoading === "restart" ? "..." : "Restart"}
    </Button>
    <Button
      variant="danger"
      size="sm"
      disabled={actionLoading !== ""}
      onclick={() => handleAction(stopCore, "stop")}
    >
      {actionLoading === "stop" ? "..." : "Stop"}
    </Button>
  {/snippet}

  {#if data.coreServices.length > 0}
    <Card>
      <CardHeader title="Status" actions={statusActions} />
      <div class="divide-border divide-y">
        {#each data.coreServices as svc (svc.name)}
          <div class="flex items-center justify-between px-5 py-3">
            <div>
              <p class="font-mono text-sm">{svc.name}</p>
              <p class="text-text-muted font-mono text-xs">{svc.image}</p>
            </div>
            <span class="text-xs font-medium {statusColor(svc.state)}">
              {svc.state}
            </span>
          </div>
        {/each}
      </div>
    </Card>
  {/if}

  <form onsubmit={handleSave}>
    <div class="space-y-6">
      {#each groups as group (group.id)}
        <Card>
          <CardHeader title={group.label}>
            {#snippet subtitle()}
              {#if group.optional}
                <span class="text-text-muted text-xs font-normal"
                  >Optional</span
                >
              {/if}
            {/snippet}
          </CardHeader>
          <div class="space-y-4 p-5">
            {#each group.keys as keyDef (keyDef.key)}
              {@const field = fieldFor(keyDef.key)}
              <div class="grid grid-cols-3 items-center gap-4">
                <label
                  for={keyDef.key}
                  class="text-text-secondary text-sm font-medium"
                >
                  {keyDef.label}
                  {#if keyDef.secret && field?.hadValue && !field.dirty}
                    <span
                      class="bg-success/15 text-success ml-2 rounded px-1.5 py-0.5 text-[10px] font-medium"
                    >
                      set
                    </span>
                  {:else if keyDef.secret && field?.dirty && field.value === ""}
                    <span
                      class="bg-warning/15 text-warning ml-2 rounded px-1.5 py-0.5 text-[10px] font-medium"
                    >
                      will clear
                    </span>
                  {:else if keyDef.secret && field?.dirty}
                    <span
                      class="bg-success/15 text-success ml-2 rounded px-1.5 py-0.5 text-[10px] font-medium"
                    >
                      modified
                    </span>
                  {:else if keyDef.secret && !field?.hadValue}
                    <span
                      class="bg-warning/15 text-warning ml-2 rounded px-1.5 py-0.5 text-[10px] font-medium"
                    >
                      unset
                    </span>
                  {/if}
                </label>
                <div class="col-span-2">
                  <div class="flex items-center gap-2">
                    <input
                      id={keyDef.key}
                      name={keyDef.key}
                      type={keyDef.secret ? "password" : "text"}
                      value={field?.secret
                        ? field.value
                        : (field?.value ?? "")}
                      oninput={(e) => {
                        if (field) {
                          field.value = (
                            e.target as HTMLInputElement
                          ).value;
                          field.dirty = true;
                        }
                      }}
                      placeholder={keyDef.secret &&
                      field?.hadValue &&
                      !field.dirty
                        ? "Leave empty to keep the current value…"
                        : keyDef.placeholder}
                      class="w-full font-mono text-sm"
                    />
                    {#if field?.dirty}
                      <button
                        type="button"
                        onclick={() => undoField(keyDef.key)}
                        class="text-text-muted hover:text-danger shrink-0 p-1 transition-colors"
                        aria-label="Undo changes"
                        title="Undo changes"
                      >
                        Undo
                      </button>
                    {:else if keyDef.secret && field?.hadValue}
                      <button
                        type="button"
                        onclick={() => clearSecret(keyDef.key)}
                        class="text-text-muted hover:text-danger shrink-0 p-1 text-xs transition-colors"
                        title="Clear stored value"
                      >
                        Clear
                      </button>
                    {/if}
                  </div>
                </div>
              </div>
            {/each}
          </div>
        </Card>
      {/each}
    </div>
    <div class="mt-4 flex justify-end">
      <Button variant="secondary" type="submit">Save Configuration</Button>
    </div>
  </form>

  <div class="-mt-4 flex justify-end">
    <Button
      variant="primary"
      disabled={actionLoading !== "" || !data.isConfigured}
      onclick={() => handleAction(deployCore, "deploy")}
    >
      {actionLoading === "deploy" ? "Deploying..." : "Deploy Core Stack"}
    </Button>
  </div>
</div>
