<script lang="ts">
  import { resolve } from "$app/paths";
  import { enhance } from "$app/forms";
  import { Alert, Button, ActionForm } from "@laber/ui";
  import StackServices from "./StackServices.svelte";
  import StackEnvEditor from "./StackEnvEditor.svelte";
  import StackDeploymentLogs from "./StackDeploymentLogs.svelte";

  let { data, form } = $props();
  let activeTab = $state<"services" | "env" | "logs">("services");
  let actionLoading = $state("");

  const tabs = [
    { id: "services" as const, label: "Services" },
    { id: "env" as const, label: "Environment" },
    { id: "logs" as const, label: "Deployments" },
  ];

  function setLoading(v: string) {
    actionLoading = v;
  }
</script>

<svelte:head>
  <title>{data.stack.name} - Laber</title>
</svelte:head>

<div class="space-y-6">
  <div class="flex items-center justify-between">
    <div>
      <div class="flex items-center gap-3">
        <a
          href={resolve("/stacks")}
          class="text-text-muted hover:text-text-secondary text-sm"
        >
          Stacks
        </a>
        <span class="text-text-muted text-sm">/</span>
        <h1 class="font-mono text-2xl font-semibold">{data.stack.name}</h1>
      </div>
      <p class="text-text-muted mt-1 font-mono text-xs">
        {data.stack.relativePath}/{data.stack.composeFile}
      </p>
    </div>

    <div class="flex items-center gap-2">
      <ActionForm action="?/pull" onLoadingChange={setLoading} {enhance}>
        <Button
          variant="secondary"
          size="sm"
          type="submit"
          disabled={actionLoading !== ""}
        >
          {actionLoading === "pull" ? "Pulling..." : "Pull"}
        </Button>
      </ActionForm>

      {#if data.stack.status === "deployed"}
        <ActionForm action="?/restart" onLoadingChange={setLoading} {enhance}>
          <Button
            variant="secondary"
            size="sm"
            type="submit"
            disabled={actionLoading !== ""}
          >
            {actionLoading === "restart" ? "Restarting..." : "Restart"}
          </Button>
        </ActionForm>
        <ActionForm action="?/stop" onLoadingChange={setLoading} {enhance}>
          <Button
            variant="danger"
            size="sm"
            type="submit"
            disabled={actionLoading !== ""}
          >
            {actionLoading === "stop" ? "Stopping..." : "Stop"}
          </Button>
        </ActionForm>
      {:else}
        <ActionForm action="?/deploy" onLoadingChange={setLoading} {enhance}>
          <Button
            variant="primary"
            size="sm"
            type="submit"
            disabled={actionLoading !== ""}
          >
            {actionLoading === "deploy" ? "Deploying..." : "Deploy"}
          </Button>
        </ActionForm>
      {/if}
    </div>
  </div>

  {#if form?.output}
    <Alert variant={form?.success ? "success" : "error"} mono>
      {form.output}
    </Alert>
  {/if}

  <div class="border-border flex gap-0 border-b">
    {#each tabs as tab (tab.id)}
      <button
        onclick={() => (activeTab = tab.id)}
        class="border-b-2 px-4 py-2 text-sm font-medium transition-colors {activeTab ===
        tab.id
          ? 'border-accent text-text-primary'
          : 'text-text-muted hover:text-text-secondary border-transparent'}"
      >
        {tab.label}
      </button>
    {/each}
  </div>

  {#if activeTab === "services"}
    <StackServices containers={data.containers} services={data.services} />
  {:else if activeTab === "env"}
    <StackEnvEditor envVars={data.envVars} />
  {:else}
    <StackDeploymentLogs logs={data.logs} />
  {/if}
</div>
