<script lang="ts">
  import { Card, CardHeader, Button, Alert } from "@laber/ui";
  import { statusColor } from "$lib/utils";
  import { CORE_KEYS, CORE_KEY_GROUPS, type CoreKeyGroup } from "$lib/core-keys";
  import {
    getCoreData,
    saveCoreConfig,
    deployCore,
    stopCore,
    restartCore,
  } from "./data.remote";

  const data = $derived(await getCoreData());

  const groups = Object.entries(CORE_KEY_GROUPS).map(([id, meta]) => ({
    id: id as CoreKeyGroup,
    ...meta,
    keys: CORE_KEYS.filter((k) => k.group === id),
  }));

  let actionLoading = $state("");
  let result = $state<{ success?: boolean; output?: string; message?: string } | null>(null);

  async function handleAction(
    action: () => Promise<{ success: boolean; output: string }>,
    name: string,
  ) {
    actionLoading = name;
    result = null;
    try {
      result = await action();
    } catch (e) {
      result = { success: false, output: e instanceof Error ? e.message : "Unknown error" };
    } finally {
      actionLoading = "";
    }
  }

  async function handleSave(e: SubmitEvent) {
    e.preventDefault();
    const formData = new FormData(e.target as HTMLFormElement);
    const values: Record<string, string> = {};
    for (const keyDef of CORE_KEYS) {
      values[keyDef.key] = (formData.get(keyDef.key) as string) ?? "";
    }
    result = null;
    try {
      result = await saveCoreConfig(values);
    } catch (e) {
      result = { success: false, output: e instanceof Error ? e.message : "Unknown error" };
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
      Traefik reverse proxy with optional Cloudflare tunnel and DNS companion
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
                <span class="text-text-muted text-xs font-normal">Optional</span>
              {/if}
            {/snippet}
          </CardHeader>
          <div class="space-y-4 p-5">
            {#each group.keys as keyDef (keyDef.key)}
              <div class="grid grid-cols-3 items-center gap-4">
                <label
                  for={keyDef.key}
                  class="text-text-secondary text-sm font-medium"
                >
                  {keyDef.label}
                </label>
                <div class="col-span-2">
                  <input
                    id={keyDef.key}
                    name={keyDef.key}
                    type={keyDef.secret ? "password" : "text"}
                    value={data.config[keyDef.key]?.value ?? ""}
                    placeholder={keyDef.placeholder}
                    class="w-full font-mono text-sm"
                  />
                </div>
              </div>
            {/each}
          </div>
        </Card>
      {/each}
    </div>
    <div class="mt-4 flex justify-end">
      <Button variant="secondary" type="submit">
        Save Configuration
      </Button>
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
