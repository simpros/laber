import { Link } from "@tanstack/react-router";
import { Alert, Button } from "@laber/ui";
import { useActivity } from "@/lib/activity";
import {
  useStackAction,
  useStackDetail,
  type StackAction,
} from "@/lib/queries/stacks";
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

/**
 * Pure page: `name`/`tab` arrive as props from the one-line route wrapper
 * in `router.tsx`, so this module never imports the router tree that
 * imports it (no module cycle). Editors remount per stack via `key={name}`,
 * which is what makes prop-initialized local state correct.
 */
export default function StackDetailPage({
  name,
  tab,
  onTabChange,
}: {
  name: string;
  tab: StackTab;
  onTabChange: (tab: StackTab) => void;
}) {
  const { data, isLoading, isError, error } = useStackDetail(name);
  const { setOpen } = useActivity();

  const actionMutation = useStackAction(name);

  const pendingAction = actionMutation.pendingAction;

  function handleAction(action: StackAction) {
    actionMutation.clearResult();
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

      {actionMutation.result?.message && (
        <Alert
          variant={actionMutation.result?.success ? "success" : "error"}
        >
          {actionMutation.result.message}{" "}
          {actionMutation.result?.success && (
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="underline underline-offset-2"
            >
              View activity
            </button>
          )}
        </Alert>
      )}

      <div className="border-border flex gap-0 border-b">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => onTabChange(t.id)}
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
          key={name}
          envVars={data.envVars}
          stackName={name}
          detectedEnvVars={data.detectedEnvVars}
        />
      )}
      {tab === "secrets" && (
        <StackSecretsEditor
          key={name}
          secrets={data.secrets}
          stackName={name}
        />
      )}
      {tab === "compose" && (
        <StackComposeView
          key={name}
          content={data.composeRaw}
          fileName={data.stack.composeFile}
          stackName={name}
        />
      )}
      {tab === "logs" && <StackDeploymentLogs logs={data.logs} />}
    </div>
  );
}
