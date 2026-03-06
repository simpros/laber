<script lang="ts">
  import { page } from "$app/state";
  import { resolve } from "$app/paths";
  import { Alert, Button } from "@laber/ui";
  import StackServices from "./StackServices.svelte";
  import StackEnvEditor from "./StackEnvEditor.svelte";
  import StackDeploymentLogs from "./StackDeploymentLogs.svelte";
  import {
    getStackDetail,
    deployStackCmd,
    stopStackCmd,
    restartStackCmd,
    pullStackCmd,
  } from "./data.remote";

  const stackName = $derived(page.params.name!);
  const data = $derived(await getStackDetail(stackName));
  let activeTab = $state<"services" | "env" | "logs">("services");
  let actionLoading = $state("");
  let result = $state<{ success?: boolean; output?: string } | null>(null);

  const tabs = [
    { id: "services" as const, label: "Services" },
    { id: "env" as const, label: "Environment" },
    { id: "logs" as const, label: "Deployments" },
  ];

  async function handleAction(
    action: (name: string) => Promise<{ success: boolean; output: string }>,
    name: string,
  ) {
    actionLoading = name;
    result = null;
    try {
      result = await action(stackName);
    } catch (e) {
      result = { success: false, output: e instanceof Error ? e.message : "Unknown error" };
    } finally {
      actionLoading = "";
    }
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
      <Button
        variant="secondary"
        size="sm"
        disabled={actionLoading !== ""}
        onclick={() => handleAction(pullStackCmd, "pull")}
      >
        {actionLoading === "pull" ? "Pulling..." : "Pull"}
      </Button>

      {#if data.stack.status === "deployed"}
        <Button
          variant="secondary"
          size="sm"
          disabled={actionLoading !== ""}
          onclick={() => handleAction(restartStackCmd, "restart")}
        >
          {actionLoading === "restart" ? "Restarting..." : "Restart"}
        </Button>
        <Button
          variant="danger"
          size="sm"
          disabled={actionLoading !== ""}
          onclick={() => handleAction(stopStackCmd, "stop")}
        >
          {actionLoading === "stop" ? "Stopping..." : "Stop"}
        </Button>
      {:else}
        <Button
          variant="primary"
          size="sm"
          disabled={actionLoading !== ""}
          onclick={() => handleAction(deployStackCmd, "deploy")}
        >
          {actionLoading === "deploy" ? "Deploying..." : "Deploy"}
        </Button>
      {/if}
    </div>
  </div>

  {#if result?.output}
    <Alert variant={result?.success ? "success" : "error"} mono>
      {result.output}
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
    <StackEnvEditor envVars={data.envVars} stackName={stackName} />
  {:else}
    <StackDeploymentLogs logs={data.logs} />
  {/if}
</div>
