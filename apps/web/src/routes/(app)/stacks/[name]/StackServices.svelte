<script lang="ts">
  import { Card } from "@laber/ui";
  import { statusColor, containerStatusBg } from "$lib/utils";
  import type { ContainerInfo } from "$lib/types";

  type ServiceInfo = {
    name: string;
    image: string;
    traefikRoute?: { subdomain: string; port: number };
  };

  type Props = {
    containers: ContainerInfo[];
    services: ServiceInfo[];
  };

  let { containers, services }: Props = $props();
</script>

<div class="space-y-3">
  {#if containers.length > 0}
    <h3
      class="text-text-secondary text-xs font-medium tracking-wider uppercase"
    >
      Running Containers
    </h3>
    {#each containers as container (container.name)}
      <div
        class="rounded-xl border p-4 {containerStatusBg(container.state)}"
      >
        <div class="flex items-center justify-between">
          <div>
            <p class="font-mono text-sm font-medium">{container.name}</p>
            <p class="text-text-muted mt-0.5 font-mono text-xs">
              {container.image}
            </p>
          </div>
          <span class="text-xs font-medium {statusColor(container.state)}">
            {container.status}
          </span>
        </div>
        {#if container.ports.length > 0}
          <div class="mt-2 flex flex-wrap gap-1.5">
            {#each container.ports as port, i (i)}
              <span
                class="bg-surface-3 rounded px-1.5 py-0.5 font-mono text-xs"
              >
                {port.host}:{port.container}
              </span>
            {/each}
          </div>
        {/if}
      </div>
    {/each}
  {:else if services.length > 0}
    <h3
      class="text-text-secondary text-xs font-medium tracking-wider uppercase"
    >
      Defined Services
    </h3>
    {#each services as svc (svc.name)}
      <Card class="p-4">
        <div class="flex items-center justify-between">
          <p class="font-mono text-sm font-medium">{svc.name}</p>
          <span class="text-text-muted font-mono text-xs">{svc.image}</span
          >
        </div>
        {#if svc.traefikRoute}
          <p class="text-accent mt-1 font-mono text-xs">
            {svc.traefikRoute.subdomain}.* :{svc.traefikRoute.port}
          </p>
        {/if}
      </Card>
    {/each}
  {:else}
    <p class="text-text-muted text-sm">No service data available</p>
  {/if}
</div>
