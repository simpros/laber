import { useEffect, useRef } from "react";
import { Card, CardHeader, Button, Alert } from "@laber/ui";
import { useActivity } from "@/lib/activity";
import { statusColor } from "@/lib/utils";
import {
  CORE_KEYS,
  CORE_KEY_GROUPS,
  type CoreKey,
  type CoreKeyGroup,
} from "@/lib/core-keys";
import {
  markSaved,
  useMaskedEntries,
  valueForSave,
  type MaskedSecretState,
} from "@/lib/masked-secret";
import {
  useCore,
  useCoreAction,
  useSaveCoreConfig,
  type CoreAction,
} from "@/lib/queries/core";
import { toErrorMessage } from "@/lib/queries/actions";
import SecretBadge from "@/components/SecretBadge";
import MutationNotice from "@/components/MutationNotice";
import QueryStatus from "@/components/QueryStatus";
import { MaskedSecretField } from "@/components/MaskedSecretField";

type FieldState = MaskedSecretState & {
  key: CoreKey;
  secret: boolean;
};

export default function CorePage() {
  const query = useCore();
  const { setOpen } = useActivity();
  // Same list-editor state as the stack secret editors: index-free here,
  // rows are keyed by CORE_KEYS (stable order) instead.
  const {
    entries: fields,
    setEntries: setFields,
    applySaved,
  } = useMaskedEntries<FieldState>(() => []);
  const initializedRef = useRef(false);

  const groups = Object.entries(CORE_KEY_GROUPS).map(([id, meta]) => ({
    id: id as CoreKeyGroup,
    ...meta,
    keys: CORE_KEYS.filter((k) => k.group === id),
  }));

  // Init once from the first server snapshot; after that the save handler
  // owns the local snapshot (hadValue/dirty) so a background refetch can
  // never clobber in-progress edits.
  const snapshot = query.data;
  useEffect(() => {
    if (!snapshot || initializedRef.current) return;
    initializedRef.current = true;
    setFields(
      CORE_KEYS.map((keyDef) => {
        const stored = snapshot.config[keyDef.key];
        return {
          key: keyDef.key,
          secret: keyDef.secret,
          hadValue: stored?.hasValue ?? false,
          value: keyDef.secret ? "" : (stored?.value ?? ""),
          dirty: false,
        };
      }),
    );
  }, [snapshot, setFields]);

  const saveMutation = useSaveCoreConfig({
    // The server now holds what we sent: fold it into the local snapshot
    // instead of waiting for the refetch. Secrets clear back to the
    // untouched snapshot; plain values just lose their dirty flag.
    onSaved: () =>
      applySaved((f) =>
        f.dirty
          ? { ...f, ...(f.secret ? markSaved(f) : { dirty: false }) }
          : f,
      ),
  });

  const actionMutation = useCoreAction();

  const pendingAction = actionMutation.pendingAction;

  function fieldFor(key: string): FieldState | undefined {
    return fields.find((f) => f.key === key);
  }

  function updateField(key: string, patch: Partial<FieldState>) {
    setFields((prev) =>
      prev.map((f) => (f.key === key ? { ...f, ...patch } : f)),
    );
  }

  function resetFeedback() {
    saveMutation.reset();
    actionMutation.reset();
  }

  function handleAction(action: CoreAction) {
    resetFeedback();
    actionMutation.mutate(action);
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const values: Partial<Record<CoreKey, string | null>> = {};
    for (const f of fields) {
      values[f.key] = f.secret ? valueForSave(f) : f.value;
    }
    resetFeedback();
    saveMutation.mutate(values);
  }

  return (
    <QueryStatus query={query} failedMessage="Failed to load core">
      {(data) => (
        <div className="space-y-8">
          <div>
            <h1 className="text-2xl font-semibold">Core Services</h1>
            <p className="text-text-secondary mt-1 text-sm">
              Traefik reverse proxy with optional Cloudflare tunnel and DNS
              companion
            </p>
          </div>

          <MutationNotice
            mutation={saveMutation}
            errorFallback="Save failed"
          />
          {actionMutation.data && (
            <Alert variant="success">
              {actionMutation.data}{" "}
              <button
                type="button"
                onClick={() => setOpen(true)}
                className="underline underline-offset-2"
              >
                View activity
              </button>
            </Alert>
          )}
          {actionMutation.isError && (
            <Alert variant="error">
              {toErrorMessage(actionMutation.error)}
            </Alert>
          )}

          {data.coreServices.length > 0 && (
            <Card>
              <CardHeader
                title="Status"
                actions={
                  <>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={actionMutation.isPending}
                      onClick={() => handleAction("restart")}
                    >
                      {pendingAction === "restart" ? "..." : "Restart"}
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      disabled={actionMutation.isPending}
                      onClick={() => handleAction("stop")}
                    >
                      {pendingAction === "stop" ? "..." : "Stop"}
                    </Button>
                  </>
                }
              />
              <div className="divide-border divide-y">
                {data.coreServices.map((svc) => (
                  <div
                    key={svc.name}
                    className="flex items-center justify-between px-5 py-3"
                  >
                    <div>
                      <p className="font-mono text-sm">{svc.name}</p>
                      <p className="text-text-muted font-mono text-xs">
                        {svc.image}
                      </p>
                    </div>
                    <span
                      className={`text-xs font-medium ${statusColor(svc.state)}`}
                    >
                      {svc.state}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          <form onSubmit={handleSave}>
            <div className="space-y-6">
              {groups.map((group) => (
                <Card key={group.id}>
                  <CardHeader
                    title={group.label}
                    subtitle={
                      group.optional ? (
                        <span className="text-text-muted text-xs font-normal">
                          Optional
                        </span>
                      ) : undefined
                    }
                  />
                  <div className="space-y-4 p-5">
                    {group.keys.map((keyDef) => {
                      const field = fieldFor(keyDef.key);
                      return (
                        <div
                          key={keyDef.key}
                          className="grid grid-cols-3 items-center gap-4"
                        >
                          <label
                            htmlFor={keyDef.key}
                            className="text-text-secondary text-sm font-medium"
                          >
                            {keyDef.label}
                            {keyDef.secret && field ? (
                              <SecretBadge entry={field} />
                            ) : null}
                          </label>
                          <div className="col-span-2">
                            {keyDef.secret && field ? (
                              <MaskedSecretField
                                id={keyDef.key}
                                name={keyDef.key}
                                entry={field}
                                onInput={(value) =>
                                  updateField(keyDef.key, {
                                    value,
                                    dirty: true,
                                  })
                                }
                                onUndo={() =>
                                  updateField(keyDef.key, {
                                    value: "",
                                    dirty: false,
                                  })
                                }
                                onClear={() =>
                                  updateField(keyDef.key, {
                                    value: "",
                                    dirty: true,
                                  })
                                }
                              />
                            ) : (
                              <div className="flex items-center gap-2">
                                <input
                                  id={keyDef.key}
                                  name={keyDef.key}
                                  type="text"
                                  value={field?.value ?? ""}
                                  onChange={(e) =>
                                    field &&
                                    updateField(keyDef.key, {
                                      value: e.target.value,
                                      dirty: true,
                                    })
                                  }
                                  placeholder={keyDef.placeholder}
                                  className="w-full font-mono text-sm"
                                />
                                {field?.dirty ? (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      updateField(keyDef.key, {
                                        value:
                                          data.config[keyDef.key]?.value ?? "",
                                        dirty: false,
                                      })
                                    }
                                    className="text-text-muted hover:text-danger shrink-0 p-1 transition-colors"
                                    aria-label="Undo changes"
                                    title="Undo changes"
                                  >
                                    Undo
                                  </button>
                                ) : null}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </Card>
              ))}
            </div>
            <div className="mt-4 flex justify-end">
              <Button
                variant="secondary"
                type="submit"
                disabled={saveMutation.isPending}
              >
                {saveMutation.isPending ? "Saving..." : "Save Configuration"}
              </Button>
            </div>
          </form>

          <div className="-mt-4 flex justify-end">
            <Button
              variant="primary"
              disabled={actionMutation.isPending || !data.isConfigured}
              onClick={() => handleAction("deploy")}
            >
              {pendingAction === "deploy"
                ? "Deploying..."
                : "Deploy Core Stack"}
            </Button>
          </div>
        </div>
      )}
    </QueryStatus>
  );
}
