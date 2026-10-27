import { Link } from "@tanstack/react-router";
import { Card, Icon, StatusBadge } from "@laber/ui";
import { stackTone } from "@/lib/status-tone";
import { useStacks } from "@/lib/queries/stacks";
import QueryStatus from "@/components/QueryStatus";

export default function StacksPage() {
  const query = useStacks();

  return (
    <QueryStatus query={query} failedMessage="Failed to load stacks">
      {(stacks) => (
        <div className="space-y-6">
          <div className="animate-rise">
            <h1 className="text-2xl font-semibold tracking-tight">
              Stacks
            </h1>
            <p className="text-text-secondary mt-1 text-sm">
              Manage your deployed services
            </p>
          </div>

          {stacks.length === 0 ? (
            <Card className="animate-rise px-6 py-16 text-center">
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
              {stacks.map((stack, i) => (
                <Link
                  key={stack.name}
                  to="/stacks/$name"
                  params={{ name: stack.name }}
                  search={{ tab: undefined }}
                  style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
                  className="animate-rise bg-surface-2 border-border group [@media(hover:hover)]:hover:border-accent/40 rounded-xl border p-5 shadow-sm shadow-black/5 transition-[border-color,transform,box-shadow] duration-200 ease-out active:scale-[0.99] [@media(hover:hover)]:hover:-translate-y-0.5 [@media(hover:hover)]:hover:shadow-lg [@media(hover:hover)]:hover:shadow-black/10"
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
                    <StatusBadge
                      tone={stackTone(stack.status)}
                      className="rounded-full px-2"
                    >
                      {stack.status}
                    </StatusBadge>
                  </div>

                  <div className="text-text-muted mt-4 flex items-center gap-3 text-xs">
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
      )}
    </QueryStatus>
  );
}
