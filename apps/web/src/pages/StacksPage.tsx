import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Card, Icon } from "@laber/ui";
import { api, unwrap } from "@/lib/api";
import { statusBadge } from "@/lib/utils";

export function useStacks() {
  return useQuery({
    queryKey: ["stacks"],
    queryFn: async () => unwrap(await api.api.stacks.get()),
  });
}

export default function StacksPage() {
  const { data: stacks, isLoading, isError, error } = useStacks();

  if (isLoading)
    return <p className="text-text-muted text-sm">Loading…</p>;
  if (isError || !stacks)
    return (
      <p className="text-danger text-sm">
        {error instanceof Error ? error.message : "Failed to load stacks"}
      </p>
    );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Stacks</h1>
        <p className="text-text-secondary mt-1 text-sm">
          Manage your deployed services
        </p>
      </div>

      {stacks.length === 0 ? (
        <Card className="px-6 py-12 text-center">
          <Icon size="lg" className="mx-auto h-12 w-12 opacity-20">
            <path d="M8 1.5L14.5 5.5L8 9.5L1.5 5.5Z" />
            <path d="M1.5 8L8 12L14.5 8" />
            <path d="M1.5 10.5L8 14.5L14.5 10.5" />
          </Icon>
          <p className="text-text-secondary mt-4 text-sm">
            No stacks discovered yet. Link a repository to get started.
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {stacks.map((stack) => (
            <Link
              key={stack.name}
              to="/stacks/$name"
              params={{ name: stack.name }}
              search={{ tab: undefined }}
              className="bg-surface-2 border-border hover:border-border-hover group rounded-xl border p-5 transition-colors"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-mono text-sm font-semibold">
                    {stack.name}
                  </h3>
                  <p className="text-text-muted mt-0.5 text-xs">
                    {stack.relativePath}
                  </p>
                </div>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusBadge(stack.status)}`}
                >
                  {stack.status}
                </span>
              </div>

              <div className="text-text-muted mt-4 flex items-center gap-3 text-xs">
                {"networkName" in stack && stack.networkName ? (
                  <span className="font-mono">
                    net:{String(stack.networkName)}
                  </span>
                ) : null}
                <span>{stack.envVarCount} env vars</span>
                {stack.repoName && (
                  <span className="ml-auto truncate">
                    {stack.repoName}
                  </span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
