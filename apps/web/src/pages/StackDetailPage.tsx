import { useState } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Alert, Button } from "@laber/ui";
import { api, unwrap } from "@/lib/api";
import { stackDetailRoute } from "@/router";
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

type StackAction = "deploy" | "stop" | "restart" | "pull";

export default function StackDetailPage() {
  const { name } = stackDetailRoute.useParams();
  const { tab } = stackDetailRoute.useSearch();
  const navigate = stackDetailRoute.useNavigate();
  const activeTab: StackTab = tab ?? "services";
  const queryClient = useQueryClient();
  const { data, isLoading, isError, error } = useStackDetail(name);

  const [result, setResult] = useState<{
    success?: boolean;
    output?: string;
  } | null>(null);

  const actionMutation = useMutation({
    mutationFn: async (action: StackAction) => {
      const stack = api.api.stacks({ name });
      switch (action) {
        case "deploy":
          return unwrap(await stack.deploy.post());
        case "stop":
          return unwrap(await stack.stop.post());
        case "restart":
          return unwrap(await stack.restart.post());
        case "pull":
          return unwrap(await stack.pull.post());
      }
    },
    onSuccess: (res) => {
      setResult(res);
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
  });

  const pendingAction = actionMutation.isPending
    ? actionMutation.variables
    : undefined;

  function handleAction(action: StackAction) {
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
    navigate({ search: { tab: next } });
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
            disabled={actionMutation.isPending}
            onClick={() => handleAction("pull")}
          >
            {pendingAction === "pull" ? "Pulling..." : "Pull"}
          </Button>

          {isRunning ? (
            <>
              <Button
                variant="secondary"
                size="sm"
                disabled={actionMutation.isPending}
                onClick={() => handleAction("restart")}
              >
                {pendingAction === "restart" ? "Restarting..." : "Restart"}
              </Button>
              <Button
                variant="danger"
                size="sm"
                disabled={actionMutation.isPending}
                onClick={() => handleAction("stop")}
              >
                {pendingAction === "stop" ? "Stopping..." : "Stop"}
              </Button>
            </>
          ) : (
            <Button
              variant="primary"
              size="sm"
              disabled={actionMutation.isPending}
              onClick={() => handleAction("deploy")}
            >
              {pendingAction === "deploy" ? "Deploying..." : "Deploy"}
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
              activeTab === t.id
                ? "border-accent text-text-primary"
                : "text-text-muted hover:text-text-secondary border-transparent"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === "services" && (
        <StackServices
          containers={data.containers}
          services={data.services}
        />
      )}
      {activeTab === "env" && (
        <StackEnvEditor
          key={name}
          envVars={data.envVars}
          stackName={name}
          detectedEnvVars={data.detectedEnvVars}
        />
      )}
      {activeTab === "secrets" && (
        <StackSecretsEditor
          key={name}
          secrets={data.secrets}
          stackName={name}
        />
      )}
      {activeTab === "compose" && (
        <StackComposeView
          key={name}
          content={data.composeRaw}
          fileName={data.stack.composeFile}
          stackName={name}
        />
      )}
      {activeTab === "logs" && <StackDeploymentLogs logs={data.logs} />}
    </div>
  );
}
