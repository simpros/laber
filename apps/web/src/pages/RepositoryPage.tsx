import { useState } from "react";
import { useForm } from "@tanstack/react-form";
import { Card, Button, Icon } from "@laber/ui";
import { timeAgo } from "@/lib/utils";
import {
  useAddRepository,
  useRemoveRepository,
  useRepositories,
  useSyncRepository,
} from "@/lib/queries/repositories";
import MutationNotice from "@/components/MutationNotice";
import QueryStatus from "@/components/QueryStatus";

export default function RepositoryPage() {
  const query = useRepositories();
  const [showAddForm, setShowAddForm] = useState(false);

  const addMutation = useAddRepository({
    onAdded: () => setShowAddForm(false),
  });
  const syncMutation = useSyncRepository();
  const removeMutation = useRemoveRepository();

  const form = useForm({
    defaultValues: {
      name: "",
      url: "",
      branch: "main",
      stacksPath: "stacks",
      sshPrivateKey: "",
    },
    onSubmit: async ({ value }) => {
      // Awaited so react-form stays submitting through the mutation —
      // the same atomic handoff auth pages get via `enterApp`.
      await addMutation.mutateAsync({
        name: value.name,
        url: value.url,
        branch: value.branch || "main",
        stacksPath: value.stacksPath || "stacks",
        sshPrivateKey: value.sshPrivateKey || null,
      });
    },
  });

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

      <MutationNotice
        mutations={[
          { mutation: addMutation, errorFallback: "Failed to add repository" },
          {
            mutation: syncMutation,
            errorFallback: "Failed to sync repository",
          },
          {
            mutation: removeMutation,
            errorFallback: "Failed to remove repository",
          },
        ]}
      />

      {(showAddForm || data.repositories.length === 0) && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            form.handleSubmit();
          }}
        >
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
                  <form.Field name="name">
                    {(field) => (
                      <input
                        id="name"
                        name="name"
                        required
                        placeholder="homelab"
                        className="w-full"
                        value={field.state.value}
                        onChange={(e) =>
                          field.handleChange(e.target.value)
                        }
                      />
                    )}
                  </form.Field>
                </div>
                <div className="space-y-1">
                  <label
                    htmlFor="branch"
                    className="text-text-secondary text-xs"
                  >
                    Branch
                  </label>
                  <form.Field name="branch">
                    {(field) => (
                      <input
                        id="branch"
                        name="branch"
                        placeholder="main"
                        className="w-full"
                        value={field.state.value}
                        onChange={(e) =>
                          field.handleChange(e.target.value)
                        }
                      />
                    )}
                  </form.Field>
                </div>
              </div>
              <div className="space-y-1">
                <label
                  htmlFor="url"
                  className="text-text-secondary text-xs"
                >
                  Repository URL
                </label>
                <form.Field name="url">
                  {(field) => (
                    <input
                      id="url"
                      name="url"
                      required
                      placeholder="git@gitlab.com:user/homelab.git"
                      className="w-full font-mono text-sm"
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                    />
                  )}
                </form.Field>
              </div>
              <div className="space-y-1">
                <label
                  htmlFor="stacksPath"
                  className="text-text-secondary text-xs"
                >
                  Stacks Path
                </label>
                <form.Field name="stacksPath">
                  {(field) => (
                    <input
                      id="stacksPath"
                      name="stacksPath"
                      placeholder="stacks"
                      className="w-full font-mono text-sm"
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                    />
                  )}
                </form.Field>
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
                <form.Field name="sshPrivateKey">
                  {(field) => (
                    <textarea
                      id="sshPrivateKey"
                      name="sshPrivateKey"
                      rows={3}
                      placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
                      className="w-full font-mono text-xs"
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                    />
                  )}
                </form.Field>
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
