<script lang="ts">
  import { enhance } from "$app/forms";
  import {
    Card,
    CardHeader,
    Button,
    Alert,
    ActionForm,
  } from "@laber/ui";
  import { statusColor } from "$lib/utils";

  let { data, form } = $props();
  let actionLoading = $state("");
</script>

<svelte:head>
  <title>Core Services - Laber</title>
</svelte:head>

<div class="space-y-8">
  <div>
    <h1 class="text-2xl font-semibold">Core Services</h1>
    <p class="text-text-secondary mt-1 text-sm">
      Traefik reverse proxy, Cloudflare tunnel, and DNS companion
    </p>
  </div>

  {#if form?.output}
    <Alert variant={form?.success ? "success" : "error"} mono>
      {form.output}
    </Alert>
  {/if}

  {#if form?.message}
    <Alert variant="success">{form.message}</Alert>
  {/if}

  {#if form?.error}
    <Alert variant="error">{form.error}</Alert>
  {/if}

  {#snippet statusActions()}
    <ActionForm
      action="?/restart"
      onLoadingChange={(v) => (actionLoading = v)}
      {enhance}
    >
      <Button
        variant="secondary"
        size="sm"
        type="submit"
        disabled={actionLoading !== ""}
      >
        {actionLoading === "restart" ? "..." : "Restart"}
      </Button>
    </ActionForm>
    <ActionForm
      action="?/stop"
      onLoadingChange={(v) => (actionLoading = v)}
      {enhance}
    >
      <Button
        variant="danger"
        size="sm"
        type="submit"
        disabled={actionLoading !== ""}
      >
        {actionLoading === "stop" ? "..." : "Stop"}
      </Button>
    </ActionForm>
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

  <form
    method="POST"
    action="?/save"
    use:enhance={() => {
      return async ({ update }) => await update();
    }}
  >
    <Card>
      <CardHeader title="Configuration" />
      <div class="space-y-4 p-5">
        {#each data.coreKeys as keyDef (keyDef.key)}
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
      <div
        class="border-border flex items-center justify-end gap-2 border-t px-5 py-3"
      >
        <Button variant="secondary" type="submit">
          Save Configuration
        </Button>
      </div>
    </Card>
  </form>

  <div class="-mt-4 flex justify-end">
    <ActionForm
      action="?/deploy"
      onLoadingChange={(v) => (actionLoading = v)}
      {enhance}
    >
      <Button
        variant="primary"
        type="submit"
        disabled={actionLoading !== "" || !data.isConfigured}
      >
        {actionLoading === "deploy" ? "Deploying..." : "Deploy Core Stack"}
      </Button>
    </ActionForm>
  </div>
</div>
