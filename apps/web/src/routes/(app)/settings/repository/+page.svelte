<script lang="ts">
  import { enhance } from "$app/forms";
  import { Card, Button, Alert, Icon } from "$lib/components";
  import { timeAgo } from "$lib/utils";

  let { data, form } = $props();
  let showAddForm = $state(false);
  let syncLoading = $state<string | null>(null);
</script>

<svelte:head>
  <title>Repository Settings - Laber</title>
</svelte:head>

<div class="space-y-6">
  <div class="flex items-center justify-between">
    <div>
      <h1 class="text-2xl font-semibold">Repository</h1>
      <p class="text-text-secondary mt-1 text-sm">
        Link your homelab git repository to discover stacks
      </p>
    </div>
    {#if data.repositories.length > 0 && !showAddForm}
      <Button variant="primary" onclick={() => (showAddForm = true)}>
        Add Repository
      </Button>
    {/if}
  </div>

  {#if form?.error}
    <Alert variant="error">{form.error}</Alert>
  {/if}

  {#if form?.success}
    <Alert variant="success">
      {#if form.discovered !== undefined}
        Repository added. Discovered {form.discovered} stack(s).
      {:else if form.newStacks !== undefined}
        Synced. Found {form.newStacks} new stack(s).
      {:else}
        Success.
      {/if}
    </Alert>
  {/if}

  {#if showAddForm || data.repositories.length === 0}
    <form
      method="POST"
      action="?/add"
      use:enhance={() => {
        return async ({ result, update }) => {
          if (result.type === "success") showAddForm = false;
          await update();
        };
      }}
    >
      <Card class="p-5">
        <h2 class="mb-4 text-sm font-medium">Add Repository</h2>
        <div class="space-y-3">
          <div class="grid grid-cols-2 gap-3">
            <div class="space-y-1">
              <label for="name" class="text-text-secondary text-xs"
                >Name</label
              >
              <input
                id="name"
                name="name"
                required
                placeholder="homelab"
                class="w-full"
              />
            </div>
            <div class="space-y-1">
              <label for="branch" class="text-text-secondary text-xs"
                >Branch</label
              >
              <input
                id="branch"
                name="branch"
                value="main"
                placeholder="main"
                class="w-full"
              />
            </div>
          </div>
          <div class="space-y-1">
            <label for="url" class="text-text-secondary text-xs"
              >Repository URL</label
            >
            <input
              id="url"
              name="url"
              required
              placeholder="git@gitlab.com:user/homelab.git"
              class="w-full font-mono text-sm"
            />
          </div>
          <div class="space-y-1">
            <label for="stacksPath" class="text-text-secondary text-xs"
              >Stacks Path</label
            >
            <input
              id="stacksPath"
              name="stacksPath"
              value="stacks"
              placeholder="stacks"
              class="w-full font-mono text-sm"
            />
            <p class="text-text-muted text-xs">
              Subdirectory containing stack folders
            </p>
          </div>
          <div class="space-y-1">
            <label for="sshPrivateKey" class="text-text-secondary text-xs">
              SSH Private Key (optional)
            </label>
            <textarea
              id="sshPrivateKey"
              name="sshPrivateKey"
              rows="3"
              placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
              class="w-full font-mono text-xs"
            ></textarea>
          </div>
        </div>
        <div class="mt-4 flex gap-2">
          <Button variant="primary" type="submit">
            Add & Discover Stacks
          </Button>
          {#if data.repositories.length > 0}
            <Button
              variant="ghost"
              type="button"
              onclick={() => (showAddForm = false)}
            >
              Cancel
            </Button>
          {/if}
        </div>
      </Card>
    </form>
  {/if}

  {#each data.repositories as repo (repo.id)}
    <Card>
      <div class="flex items-center justify-between px-5 py-4">
        <div>
          <h3 class="font-mono text-sm font-semibold">{repo.name}</h3>
          <p class="text-text-muted mt-0.5 font-mono text-xs">
            {repo.url}
          </p>
        </div>
        <div class="flex items-center gap-2">
          <span class="text-text-muted text-xs">
            Synced {timeAgo(repo.lastSyncedAt)}
          </span>
          <form
            method="POST"
            action="?/sync"
            use:enhance={() => {
              syncLoading = repo.id;
              return async ({ update }) => {
                syncLoading = null;
                await update();
              };
            }}
          >
            <input type="hidden" name="repoId" value={repo.id} />
            <Button
              variant="secondary"
              size="sm"
              type="submit"
              disabled={syncLoading === repo.id}
            >
              {syncLoading === repo.id ? "Syncing..." : "Sync"}
            </Button>
          </form>
          <form method="POST" action="?/remove" use:enhance>
            <input type="hidden" name="repoId" value={repo.id} />
            <button
              type="submit"
              class="text-text-muted hover:text-danger p-1.5 transition-colors"
              title="Remove repository"
            >
              <Icon>
                <path
                  d="M2.5 4.5h11M5.5 4.5V3a1 1 0 011-1h3a1 1 0 011 1v1.5M6.5 7v4M9.5 7v4M3.5 4.5l.5 8.5a1 1 0 001 1h6a1 1 0 001-1l.5-8.5"
                />
              </Icon>
            </button>
          </form>
        </div>
      </div>
      <div class="border-border border-t px-5 py-3">
        <div class="text-text-muted flex gap-4 text-xs">
          <span
            >Branch: <strong class="text-text-secondary"
              >{repo.branch}</strong
            ></span
          >
          <span
            >Stacks path: <strong class="text-text-secondary font-mono"
              >{repo.stacksPath}/</strong
            ></span
          >
          <span>
            {data.stacks.filter((s) => s.repositoryId === repo.id).length} stacks
          </span>
        </div>
      </div>
    </Card>
  {/each}
</div>
