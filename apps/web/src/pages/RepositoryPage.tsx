import { useState } from "react";
import { Card, Button, Icon } from "@laber/ui";
import { timeAgo } from "@/lib/utils";
import {
  addRepositorySave,
  useRemoveRepository,
  useRepositories,
  useSyncRepository,
} from "@/lib/queries/repositories";
import { useApiMutation } from "@/lib/queries/actions";
import MutationNotice from "@/components/MutationNotice";
import QueryStatus from "@/components/QueryStatus";

export default function RepositoryPage() {
  const query = useRepositories();
  const [showAddForm, setShowAddForm] = useState(false);

  // Query-layer wire + invalidation only; the page owns the form-surface
  // side effect (`setShowAddForm(false)`) as the mutation's `onSuccess`.
  const addMutation = useApiMutation({
    ...addRepositorySave(),
    onSuccess: () => setShowAddForm(false),
  });
  const syncMutation = useSyncRepository();
  const removeMutation = useRemoveRepository();

  // Plain controlled inputs: the only async owner is the mutation, so
  // `isPending` is the button state — no form library, no second pending
  // channel (react-form stays on `AuthCredentialsForm`, which needs
  // `isSubmitting` for the `enterApp` gate handoff).
  const [formValues, setFormValues] = useState({
    name: "",
    url: "",
    branch: "main",
    stacksPath: "stacks",
    sshPrivateKey: "",
  });

  function setField(key: keyof typeof formValues, value: string) {
    setFormValues((prev) => ({ ...prev, [key]: value }));
  }

  function handleAddSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Fire-and-forget: `MutationNotice` is the one error owner, and the form
    // closes in the mutation `onSuccess` on success only — awaiting here
    // would surface the same failure twice (rejected submit + notice).
    addMutation.mutate({
      name: formValues.name,
      url: formValues.url,
      branch: formValues.branch || "main",
      stacksPath: formValues.stacksPath || "stacks",
      sshPrivateKey: formValues.sshPrivateKey || null,
    });
  }

  const syncingRepoId = syncMutation.syncingRepoId;

  function handleSync(repoId: string) {
    syncMutation.mutate(repoId);
  }

  function handleRemove(repoId: string) {
    removeMutation.mutate(repoId);
  }

  return (
    <QueryStatus query={query} failedMessage="Failed to load repositories">
      {(data) => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Repository</h1>
          <p className="text-text-secondary mt-1 text-sm">
            Link your homelab git repository to discover stacks
          </p>
        </div>
        {data.repositories.length > 0 && !showAddForm && (
          <Button variant="primary" onClick={() => setShowAddForm(true)}>
            Add Repository
          </Button>
        )}
      </div>

      {/* One small notice per action: each mutation resets its own terminal
       * state on submit, so no sibling choreography and no latest-settled
       * group — a stale Add failure can never hide behind a Sync success. */}
      <MutationNotice
        mutation={addMutation}
        errorFallback="Failed to add repository"
      />
      <MutationNotice
        mutation={syncMutation}
        errorFallback="Failed to sync repository"
      />
      <MutationNotice
        mutation={removeMutation}
        errorFallback="Failed to remove repository"
      />

      {(showAddForm || data.repositories.length === 0) && (
        <form onSubmit={handleAddSubmit}>
          <Card className="p-5">
            <h2 className="mb-4 text-sm font-medium">Add Repository</h2>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label
                    htmlFor="name"
                    className="text-text-secondary text-xs"
                  >
                    Name
                  </label>
                  <input
                    id="name"
                    name="name"
                    required
                    placeholder="homelab"
                    className="w-full"
                    value={formValues.name}
                    onChange={(e) => setField("name", e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label
                    htmlFor="branch"
                    className="text-text-secondary text-xs"
                  >
                    Branch
                  </label>
                  <input
                    id="branch"
                    name="branch"
                    placeholder="main"
                    className="w-full"
                    value={formValues.branch}
                    onChange={(e) => setField("branch", e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label
                  htmlFor="url"
                  className="text-text-secondary text-xs"
                >
                  Repository URL
                </label>
                <input
                  id="url"
                  name="url"
                  required
                  placeholder="git@gitlab.com:user/homelab.git"
                  className="w-full font-mono text-sm"
                  value={formValues.url}
                  onChange={(e) => setField("url", e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <label
                  htmlFor="stacksPath"
                  className="text-text-secondary text-xs"
                >
                  Stacks Path
                </label>
                <input
                  id="stacksPath"
                  name="stacksPath"
                  placeholder="stacks"
                  className="w-full font-mono text-sm"
                  value={formValues.stacksPath}
                  onChange={(e) => setField("stacksPath", e.target.value)}
                />
                <p className="text-text-muted text-xs">
                  Subdirectory containing stack folders
                </p>
              </div>
              <div className="space-y-1">
                <label
                  htmlFor="sshPrivateKey"
                  className="text-text-secondary text-xs"
                >
                  SSH Private Key (optional)
                </label>
                <textarea
                  id="sshPrivateKey"
                  name="sshPrivateKey"
                  rows={3}
                  placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
                  className="w-full font-mono text-xs"
                  value={formValues.sshPrivateKey}
                  onChange={(e) => setField("sshPrivateKey", e.target.value)}
                />
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <Button
                variant="primary"
                type="submit"
                disabled={addMutation.isPending}
              >
                {addMutation.isPending
                  ? "Adding..."
                  : "Add & Discover Stacks"}
              </Button>
              {data.repositories.length > 0 && (
                <Button
                  variant="ghost"
                  type="button"
                  onClick={() => setShowAddForm(false)}
                >
                  Cancel
                </Button>
              )}
            </div>
          </Card>
        </form>
      )}

      {data.repositories.map((repo) => (
        <Card key={repo.id}>
          <div className="flex items-center justify-between px-5 py-4">
            <div>
              <h3 className="font-mono text-sm font-semibold">
                {repo.name}
              </h3>
              <p className="text-text-muted mt-0.5 font-mono text-xs">
                {repo.url}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-text-muted text-xs">
                Synced {timeAgo(repo.lastSyncedAt)}
              </span>
              <Button
                variant="secondary"
                size="sm"
                disabled={syncMutation.isPending}
                onClick={() => handleSync(repo.id)}
              >
                {syncingRepoId === repo.id ? "Syncing..." : "Sync"}
              </Button>
              <button
                type="button"
                className="text-text-muted hover:text-danger p-1.5 transition-colors"
                title="Remove repository"
                onClick={() => handleRemove(repo.id)}
              >
                <Icon>
                  <path d="M2.5 4.5h11M5.5 4.5V3a1 1 0 011-1h3a1 1 0 011 1v1.5M6.5 7v4M9.5 7v4M3.5 4.5l.5 8.5a1 1 0 001 1h6a1 1 0 001-1l.5-8.5" />
                </Icon>
              </button>
            </div>
          </div>
          <div className="border-border border-t px-5 py-3">
            <div className="text-text-muted flex gap-4 text-xs">
              <span>
                Branch:{" "}
                <strong className="text-text-secondary">
                  {repo.branch}
                </strong>
              </span>
              <span>
                Stacks path:{" "}
                <strong className="text-text-secondary font-mono">
                  {repo.stacksPath}/
                </strong>
              </span>
              <span>
                {
                  data.stacks.filter((s) => s.repositoryId === repo.id)
                    .length
                }{" "}
                stacks
              </span>
            </div>
          </div>
        </Card>
      ))}
      </div>
      )}
    </QueryStatus>
  );
}
