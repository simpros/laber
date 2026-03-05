<script lang="ts">
  import { page } from "$app/state";
  import { resolve } from "$app/paths";
  import { signOut } from "@laber/auth/client";

  let { data, children } = $props();

  const nav = [
    { href: "/", label: "Dashboard", icon: "grid" },
    { href: "/stacks", label: "Stacks", icon: "layers" },
    { href: "/core", label: "Core Services", icon: "cpu" },
  ] as const;

  const bottomNav = [
    { href: "/settings/repository", label: "Repository", icon: "git" },
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

<div class="flex h-dvh overflow-hidden">
  <aside
    class="bg-surface-1 border-border flex w-60 shrink-0 flex-col border-r"
  >
    <div class="border-border flex items-center gap-2 border-b px-5 py-4">
      <span class="font-mono text-lg font-bold tracking-tight">laber</span>
      <span
        class="bg-accent/10 text-accent rounded px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase"
        >homelab</span
      >
    </div>

    <nav class="flex-1 space-y-0.5 p-3">
      {#each nav as item (item.href)}
        <a
          href={resolve(item.href)}
          class="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors {isActive(
            item.href,
          )
            ? 'bg-surface-3 text-text-primary'
            : 'text-text-secondary hover:bg-surface-2 hover:text-text-primary'}"
        >
          <svg class="h-4 w-4 shrink-0 opacity-60" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
            {#if item.icon === "grid"}
              <rect x="1.5" y="1.5" width="5" height="5" rx="1" />
              <rect x="9.5" y="1.5" width="5" height="5" rx="1" />
              <rect x="1.5" y="9.5" width="5" height="5" rx="1" />
              <rect x="9.5" y="9.5" width="5" height="5" rx="1" />
            {:else if item.icon === "layers"}
              <path d="M8 1.5L14.5 5.5L8 9.5L1.5 5.5Z" />
              <path d="M1.5 8L8 12L14.5 8" />
              <path d="M1.5 10.5L8 14.5L14.5 10.5" />
            {:else if item.icon === "cpu"}
              <rect x="4" y="4" width="8" height="8" rx="1" />
              <path d="M6.5 1.5V4M9.5 1.5V4M6.5 12V14.5M9.5 12V14.5M1.5 6.5H4M1.5 9.5H4M12 6.5H14.5M12 9.5H14.5" />
            {/if}
          </svg>
          {item.label}
        </a>
      {/each}
    </nav>

    <div class="border-border space-y-0.5 border-t p-3">
      {#each bottomNav as item (item.href)}
        <a
          href={resolve(item.href)}
          class="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors {isActive(
            item.href,
          )
            ? 'bg-surface-3 text-text-primary'
            : 'text-text-secondary hover:bg-surface-2 hover:text-text-primary'}"
        >
          <svg class="h-4 w-4 shrink-0 opacity-60" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
            <circle cx="8" cy="8" r="3" />
            <path d="M5 2.5L6.5 5M11 2.5L9.5 5M2.5 5L5 6.5M2.5 11L5 9.5M5 13.5L6.5 11M11 13.5L9.5 11M13.5 5L11 6.5M13.5 11L11 9.5" />
          </svg>
          {item.label}
        </a>
      {/each}
    </div>

    <div class="border-border border-t px-4 py-3">
      <div class="flex items-center justify-between">
        <div class="min-w-0">
          <p class="text-text-primary truncate text-sm font-medium">
            {data.user.name}
          </p>
          <p class="text-text-muted truncate text-xs">{data.user.email}</p>
        </div>
        <button
          onclick={handleSignOut}
          class="text-text-muted hover:text-danger rounded-md p-1.5 transition-colors"
          title="Sign out"
        >
          <svg class="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M6 14H3a1 1 0 01-1-1V3a1 1 0 011-1h3M11 11l3-3-3-3M6 8h8" />
          </svg>
        </button>
      </div>
    </div>
  </aside>

  <main class="flex-1 overflow-y-auto">
    <div class="p-8">
      {@render children()}
    </div>
  </main>
</div>
