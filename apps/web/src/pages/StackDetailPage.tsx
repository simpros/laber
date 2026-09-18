import { Link } from "@tanstack/react-router";
import {
  stackIsRunning,
  stackLifecycleActions,
  useStackAction,
  useStackDetail,
  type StackAction,
} from "@/lib/queries/stacks";
import StackServices from "@/components/StackServices";
import StackEnvEditor from "@/components/StackEnvEditor";
import StackSecretsEditor from "@/components/StackSecretsEditor";
import StackComposeView from "@/components/StackComposeView";
import StackDeploymentLogs from "@/components/StackDeploymentLogs";
import MutationNotice from "@/components/MutationNotice";
import LifecycleToolbar from "@/components/LifecycleToolbar";
import QueryStatus from "@/components/QueryStatus";

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
  const query = useStackDetail(name);

  const actionMutation = useStackAction(name);

  const pendingAction = actionMutation.pendingAction;

  function handleAction(action: StackAction) {
    actionMutation.mutate(action);
  }

  return (
    <QueryStatus query={query} failedMessage="Failed to load stack">
      {(data) => {
        // The action list lives in the query layer next to `stackIsRunning`
        // — the page renders the catalog, it never builds it.
        const lifecycleActions = stackLifecycleActions(stackIsRunning(data));

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
          <LifecycleToolbar
            actions={lifecycleActions}
            pendingAction={pendingAction}
            isPending={actionMutation.isPending}
            onAction={handleAction}
          />
        </div>
      </div>

      <MutationNotice
        mutation={actionMutation}
        errorFallback="Action failed"
        linkActivity
      />

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
      {/* Stateful editors stay mounted across tab switches (hidden + inert
        when inactive) so dirty env/secrets/compose drafts survive — tabs
        switch visibility, never state lifetime. Stateless Services/Logs
        above stay conditional. */}
      <div hidden={tab !== "env"} inert={tab !== "env"}>
        <StackEnvEditor
          key={name}
          envVars={data.envVars}
          stackName={name}
          detectedEnvVars={data.detectedEnvVars}
        />
      </div>
      <div hidden={tab !== "secrets"} inert={tab !== "secrets"}>
        <StackSecretsEditor
          key={name}
          secrets={data.secrets}
          stackName={name}
        />
      </div>
      <div hidden={tab !== "compose"} inert={tab !== "compose"}>
        <StackComposeView
          key={name}
          content={data.composeRaw}
          fileName={data.stack.composeFile}
          stackName={name}
        />
      </div>
      {tab === "logs" && <StackDeploymentLogs logs={data.logs} />}
        </div>
        );
      }}
    </QueryStatus>
  );
}
