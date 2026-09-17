<script lang="ts">
  import { page } from "$app/state";
  import { resolve } from "$app/paths";
  import { signOut } from "@laber/auth/client";
  import { onMount } from "svelte";
  import { theme } from "$lib/theme.svelte";
  import { Icon } from "@laber/ui";
  import ActivityPanel from "$lib/components/ActivityPanel.svelte";
  import { activityStore } from "$lib/activity.svelte";

  let { data, children } = $props();
  let sidebarOpen = $state(false);

  onMount(() => {
    theme.init(
      document.documentElement.classList.contains("dark")
        ? "dark"
        : "light"
    );
  });

  $effect(() => {
    void page.url.pathname;
    sidebarOpen = false;
  });

  const nav = [
    { href: "/", label: "Dashboard", icon: "grid" },
    { href: "/stacks", label: "Stacks", icon: "layers" },
    { href: "/core", label: "Core Services", icon: "cpu" },
  ] as const;

  const bottomNav = [
    {
      href: "/settings/repository",
      label: "Repository",
      icon: "settings",
    },
  ] as const;

  function isActive(href: string) {
    if (href === "/") return page.url.pathname === "/";
    return page.url.pathname.startsWith(href);
  }

  async function handleSignOut() {
    await signOut({
      fetchOptions: {
        onSuccess: () => {
          window.location.href = "/login";
        },
      },
    });
  }
</script>

{#snippet navIcon(icon: string)}
  {#if icon === "grid"}
    <rect x="1.5" y="1.5" width="5" height="5" rx="1" />
    <rect x="9.5" y="1.5" width="5" height="5" rx="1" />
    <rect x="1.5" y="9.5" width="5" height="5" rx="1" />
    <rect x="9.5" y="9.5" width="5" height="5" rx="1" />
  {:else if icon === "layers"}
    <path d="M8 1.5L14.5 5.5L8 9.5L1.5 5.5Z" />
    <path d="M1.5 8L8 12L14.5 8" />
    <path d="M1.5 10.5L8 14.5L14.5 10.5" />
  {:else if icon === "cpu"}
    <rect x="4" y="4" width="8" height="8" rx="1" />
    <path
      d="M6.5 1.5V4M9.5 1.5V4M6.5 12V14.5M9.5 12V14.5M1.5 6.5H4M1.5 9.5H4M12 6.5H14.5M12 9.5H14.5"
    />
  {:else if icon === "settings"}
    <circle cx="8" cy="8" r="3" />
    <path
      d="M5 2.5L6.5 5M11 2.5L9.5 5M2.5 5L5 6.5M2.5 11L5 9.5M5 13.5L6.5 11M11 13.5L9.5 11M13.5 5L11 6.5M13.5 11L11 9.5"
    />
  {/if}
{/snippet}

{#snippet navLink(href: string, label: string, icon: string)}
  <a
    href={resolve(href as "/")}
    class="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors {isActive(
      href
    )
      ? 'bg-surface-3 text-text-primary'
      : 'text-text-secondary hover:bg-surface-2 hover:text-text-primary'}"
  >
    <Icon class="opacity-60">
      {@render navIcon(icon)}
    </Icon>
    {label}
  </a>
{/snippet}

{#snippet sidebarContent()}
  <div class="border-border flex items-center gap-2 border-b px-5 py-4">
    <span class="font-mono text-lg font-bold tracking-tight">laber</span>
    <span
      class="bg-accent/10 text-accent rounded px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase"
      >homelab</span
    >
  </div>

  <nav class="flex-1 space-y-0.5 p-3">
    {#each nav as item (item.href)}
      {@render navLink(item.href, item.label, item.icon)}
    {/each}
  </nav>

  <div class="border-border space-y-0.5 border-t p-3">
    {#each bottomNav as item (item.href)}
      {@render navLink(item.href, item.label, item.icon)}
    {/each}
    <button
      onclick={() => (activityStore.open = true)}
      class="relative flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors text-text-secondary hover:bg-surface-2 hover:text-text-primary"
    >
      <Icon class="opacity-60">
        <path d="M8 1.5v5l3 1.5" />
        <circle cx="8" cy="8" r="6.5" />
      </Icon>
      Activity
      {#if activityStore.hasRunning}
        <span class="bg-accent ml-auto h-2 w-2 rounded-full">
          <span class="bg-accent absolute inset-0 h-2 w-2 animate-ping rounded-full opacity-75"></span>
        </span>
      {/if}
    </button>
  </div>

  <div class="border-border border-t px-4 py-3">
    <div class="flex items-center justify-between">
      <div class="min-w-0">
        <p class="text-text-primary truncate text-sm font-medium">
          {data.user.name}
        </p>
        <p class="text-text-muted truncate text-xs">{data.user.email}</p>
      </div>
      <div class="flex items-center gap-0.5">
        <button
          onclick={() => theme.toggle()}
          class="text-text-muted hover:text-text-primary rounded-md p-1.5 transition-colors"
          title="Toggle theme"
        >
          {#if theme.value === "dark"}
            <Icon>
              <circle cx="8" cy="8" r="3.5" />
              <path
                d="M8 1.5v1M8 13.5v1M1.5 8h1M13.5 8h1M3.4 3.4l.7.7M11.9 11.9l.7.7M3.4 12.6l.7-.7M11.9 4.1l.7-.7"
              />
            </Icon>
          {:else}
            <Icon>
              <path d="M13.5 8.5a5.5 5.5 0 01-7-7 5.5 5.5 0 107 7z" />
            </Icon>
          {/if}
        </button>
        <button
          onclick={handleSignOut}
          class="text-text-muted hover:text-danger rounded-md p-1.5 transition-colors"
          title="Sign out"
        >
          <Icon>
            <path
              d="M6 14H3a1 1 0 01-1-1V3a1 1 0 011-1h3M11 11l3-3-3-3M6 8h8"
            />
          </Icon>
        </button>
      </div>
    </div>
  </div>
{/snippet}

<div class="flex h-dvh overflow-hidden">
  <aside
    class="bg-surface-1 border-border hidden w-60 shrink-0 flex-col border-r md:flex"
  >
    {@render sidebarContent()}
  </aside>

  {#if sidebarOpen}
    <div class="fixed inset-0 z-40 md:hidden">
      <button
        class="absolute inset-0 bg-black/50"
        onclick={() => (sidebarOpen = false)}
        aria-label="Close sidebar"
      ></button>
      <aside class="bg-surface-1 border-border relative z-50 flex h-full w-60 flex-col border-r">
        {@render sidebarContent()}
      </aside>
    </div>
  {/if}

  <div class="flex min-w-0 flex-1 flex-col [contain:paint]">
    <header class="bg-surface-1 border-border flex items-center gap-3 border-b px-4 py-3 md:hidden">
      <button
        onclick={() => (sidebarOpen = true)}
        class="text-text-secondary hover:text-text-primary -ml-1 rounded-md p-1 transition-colors"
        aria-label="Open sidebar"
      >
        <Icon>
          <path d="M2 4h12M2 8h12M2 12h12" />
        </Icon>
      </button>
      <span class="font-mono text-sm font-bold tracking-tight">laber</span>
      <button
        onclick={() => (activityStore.open = true)}
        class="text-text-secondary hover:text-text-primary relative ml-auto rounded-md p-1 transition-colors"
        aria-label="Open activity panel"
      >
        <Icon>
          <path d="M8 1.5v5l3 1.5" />
          <circle cx="8" cy="8" r="6.5" />
        </Icon>
        {#if activityStore.hasRunning}
          <span class="bg-accent absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full"></span>
        {/if}
      </button>
    </header>

    <main class="flex-1 overflow-y-auto">
      <div class="p-4 sm:p-6 md:p-8">
        {@render children()}
      </div>
    </main>
  </div>

  <ActivityPanel />
</div>
