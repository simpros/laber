import { useState } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  Link,
  useParams,
  useSearch,
  useNavigate,
} from "@tanstack/react-router";
import { Alert, Button } from "@laber/ui";
import { api, unwrap } from "@/lib/api";
import StackServices from "@/components/StackServices";
import StackEnvEditor from "@/components/StackEnvEditor";
import StackSecretsEditor from "@/components/StackSecretsEditor";
import StackComposeView from "@/components/StackComposeView";
import StackDeploymentLogs from "@/components/StackDeploymentLogs";

const tabs = [
  { id: "services", label: "Services" },
  { id: "env", label: "Environment" },
  { id: "secrets", label: "Secrets" },
  { id: "compose", label: "Compose" },
  { id: "logs", label: "Deployments" },
] as const;

export type StackTab = (typeof tabs)[number]["id"];

export function useStackDetail(name: string) {
  return useQuery({
    queryKey: ["stack", name],
    queryFn: async () => unwrap(await api.api.stacks({ name }).get()),
  });
}

export default function StackDetailPage() {
  const { name } = useParams({ strict: false }) as { name: string };
  const search = useSearch({ strict: false }) as { tab?: StackTab };
  const navigate = useNavigate();
  const tab: StackTab = search.tab ?? "services";
  const queryClient = useQueryClient();
  const { data, isLoading, isError, error } = useStackDetail(name);

  const [actionLoading, setActionLoading] = useState("");
  const [result, setResult] = useState<{
    success?: boolean;
    output?: string;
  } | null>(null);

  const actionMutation = useMutation({
    mutationFn: async (action: "deploy" | "stop" | "restart" | "pull") => {
      if (action === "deploy")
        return unwrap(await api.api.stacks({ name }).deploy.post());
      if (action === "stop")
        return unwrap(await api.api.stacks({ name }).stop.post());
      if (action === "restart")
        return unwrap(await api.api.stacks({ name }).restart.post());
      return unwrap(await api.api.stacks({ name }).pull.post());
    },
    onSuccess: (res) => {
      setResult(res as { success?: boolean; output?: string });
      queryClient.invalidateQueries({ queryKey: ["stack", name] });
      queryClient.invalidateQueries({ queryKey: ["stacks"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (e) => {
      setResult({
        success: false,
        output: e instanceof Error ? e.message : "Unknown error",
      });
    },
    onSettled: () => setActionLoading(""),
  });

  function handleAction(action: "deploy" | "stop" | "restart" | "pull") {
    setActionLoading(action);
    setResult(null);
    actionMutation.mutate(action);
  }

  if (isLoading)
    return <p className="text-text-muted text-sm">Loading…</p>;
  if (isError || !data)
    return (
      <p className="text-danger text-sm">
        {error instanceof Error ? error.message : "Failed to load stack"}
      </p>
    );

  const isRunning =
    data.containers.length > 0
      ? data.containers.some((c) => c.state === "running")
      : data.stack.status === "deployed";

  function setTab(next: StackTab) {
    navigate({ search: { tab: next } as never });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <Link
              to="/stacks"
              className="text-text-muted hover:text-text-secondary text-sm"
            >
              Stacks
            </Link>
            <span className="text-text-muted text-sm">/</span>
            <h1 className="font-mono text-2xl font-semibold">
              {data.stack.name}
            </h1>
          </div>
          <p className="text-text-muted mt-1 font-mono text-xs">
            {data.stack.relativePath}/{data.stack.composeFile}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={actionLoading !== ""}
            onClick={() => handleAction("pull")}
          >
            {actionLoading === "pull" ? "Pulling..." : "Pull"}
          </Button>

          {isRunning ? (
            <>
              <Button
                variant="secondary"
                size="sm"
                disabled={actionLoading !== ""}
                onClick={() => handleAction("restart")}
              >
                {actionLoading === "restart" ? "Restarting..." : "Restart"}
              </Button>
              <Button
                variant="danger"
                size="sm"
                disabled={actionLoading !== ""}
                onClick={() => handleAction("stop")}
              >
                {actionLoading === "stop" ? "Stopping..." : "Stop"}
              </Button>
            </>
          ) : (
            <Button
              variant="primary"
              size="sm"
              disabled={actionLoading !== ""}
              onClick={() => handleAction("deploy")}
            >
              {actionLoading === "deploy" ? "Deploying..." : "Deploy"}
            </Button>
          )}
        </div>
      </div>

      {result?.output && (
        <Alert variant={result?.success ? "success" : "error"} mono>
          {result.output}
        </Alert>
      )}

      <div className="border-border flex gap-0 border-b">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
              tab === t.id
                ? "border-accent text-text-primary"
                : "text-text-muted hover:text-text-secondary border-transparent"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "services" && (
        <StackServices
          containers={data.containers}
          services={data.services}
        />
      )}
      {tab === "env" && (
        <StackEnvEditor
          envVars={data.envVars}
          stackName={name}
          detectedEnvVars={data.detectedEnvVars}
        />
      )}
      {tab === "secrets" && (
        <StackSecretsEditor secrets={data.secrets} stackName={name} />
      )}
      {tab === "compose" && (
        <StackComposeView
          content={data.composeRaw}
          fileName={data.stack.composeFile}
          stackName={name}
        />
      )}
      {tab === "logs" && <StackDeploymentLogs logs={data.logs} />}
    </div>
  );
}
