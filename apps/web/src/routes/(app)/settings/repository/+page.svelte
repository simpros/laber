<script lang="ts">
  import { enhance } from "$app/forms";

  let { data, form } = $props();
  let showAddForm = $state(false);
  let syncLoading = $state<string | null>(null);

  function timeAgo(date: Date | string | null) {
    if (!date) return "never";
    const d = typeof date === "string" ? new Date(date) : date;
    const diff = Date.now() - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  }
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
      <button
        onclick={() => (showAddForm = true)}
        class="bg-accent hover:bg-accent-hover rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors"
      >
        Add Repository
      </button>
    {/if}
  </div>

  {#if form?.error}
    <div class="bg-danger/5 border-danger/20 rounded-xl border p-4 text-sm text-danger">
      {form.error}
    </div>
  {/if}

  {#if form?.success}
    <div class="bg-success/5 border-success/20 rounded-xl border p-4 text-sm text-success">
      {#if form.discovered !== undefined}
        Repository added. Discovered {form.discovered} stack(s).
      {:else if form.newStacks !== undefined}
        Synced. Found {form.newStacks} new stack(s).
      {:else}
        Success.
      {/if}
    </div>
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
      class="bg-surface-2 border-border rounded-xl border p-5"
    >
      <h2 class="mb-4 text-sm font-medium">Add Repository</h2>
      <div class="space-y-3">
        <div class="grid grid-cols-2 gap-3">
          <div class="space-y-1">
            <label for="name" class="text-text-secondary text-xs">Name</label>
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
          <label for="sshPrivateKey" class="text-text-secondary text-xs"
            >SSH Private Key (optional)</label
          >
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
        <button
          type="submit"
          class="bg-accent hover:bg-accent-hover rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors"
        >
          Add & Discover Stacks
        </button>
        {#if data.repositories.length > 0}
          <button
            type="button"
            onclick={() => (showAddForm = false)}
            class="text-text-secondary hover:text-text-primary rounded-lg px-4 py-2 text-sm transition-colors"
          >
            Cancel
          </button>
        {/if}
      </div>
    </form>
  {/if}

  {#each data.repositories as repo (repo.id)}
    <div class="bg-surface-2 border-border rounded-xl border">
      <div class="flex items-center justify-between px-5 py-4">
        <div>
          <h3 class="font-mono text-sm font-semibold">{repo.name}</h3>
          <p class="text-text-muted mt-0.5 font-mono text-xs">{repo.url}</p>
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
            <button
              type="submit"
              disabled={syncLoading === repo.id}
              class="border-border hover:bg-surface-3 rounded-lg border px-3 py-1.5 text-xs transition-colors disabled:opacity-50"
            >
              {syncLoading === repo.id ? "Syncing..." : "Sync"}
            </button>
          </form>
          <form method="POST" action="?/remove" use:enhance>
            <input type="hidden" name="repoId" value={repo.id} />
            <button
              type="submit"
              class="text-text-muted hover:text-danger p-1.5 transition-colors"
              title="Remove repository"
            >
              <svg class="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M2.5 4.5h11M5.5 4.5V3a1 1 0 011-1h3a1 1 0 011 1v1.5M6.5 7v4M9.5 7v4M3.5 4.5l.5 8.5a1 1 0 001 1h6a1 1 0 001-1l.5-8.5" />
              </svg>
            </button>
          </form>
        </div>
      </div>
      <div class="border-border border-t px-5 py-3">
        <div class="text-text-muted flex gap-4 text-xs">
          <span>Branch: <strong class="text-text-secondary">{repo.branch}</strong></span>
          <span>Stacks path: <strong class="text-text-secondary font-mono">{repo.stacksPath}/</strong></span>
          <span>
            {data.stacks.filter((s) => s.repositoryId === repo.id).length} stacks
          </span>
        </div>
      </div>
    </div>
  {/each}
</div>
